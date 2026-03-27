from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, LabelEncoder
import networkx as nx
import uuid
import torch
from torch_geometric.data import Data

router = APIRouter()

class MappingConfig(BaseModel):
    task: int
    node_id: str
    node_label: Optional[str] = None
    node_features: List[str] = []
    edge_source: str
    edge_target: str
    edge_weight: Optional[str] = None
    edge_label: Optional[str] = None
    graph_id: Optional[str] = None
    graph_label: Optional[str] = None

class ConfigurePayload(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    graphs: Optional[List[Dict[str, Any]]] = None
    mapping: MappingConfig
    project_name: Optional[str] = "New Project"

@router.post("/configure")
async def configure_dataset(payload: ConfigurePayload):
    try:
        # Convert JSON dicts to Pandas DataFrames
        df_nodes = pd.DataFrame(payload.nodes)
        df_edges = pd.DataFrame(payload.edges)
        m = payload.mapping

        # 1. Map Node IDs to 0-based indices
        # We use pd.factorize to assign a unique integer ID from 0 to N-1
        all_node_ids = pd.concat([df_nodes[m.node_id], df_edges[m.edge_source], df_edges[m.edge_target]]).unique()
        node_mapper = {orig_id: i for i, orig_id in enumerate(all_node_ids)}
        
        df_nodes['_internal_id'] = df_nodes[m.node_id].map(node_mapper)
        df_edges['_internal_source'] = df_edges[m.edge_source].map(node_mapper)
        df_edges['_internal_target'] = df_edges[m.edge_target].map(node_mapper)

        # Drop edges that reference non-existent nodes
        df_edges.dropna(subset=['_internal_source', '_internal_target'], inplace=True)
        df_edges['_internal_source'] = df_edges['_internal_source'].astype(int)
        df_edges['_internal_target'] = df_edges['_internal_target'].astype(int)

        num_nodes = len(node_mapper)
        num_edges = len(df_edges)

        # 2. Extract Features
        # Force conversion to numeric (turn invalid strings to NaN), then fill with 0
        if m.node_features:
            features_df = df_nodes[m.node_features].apply(pd.to_numeric, errors='coerce')
            features = features_df.fillna(0).values
            scaler = StandardScaler()
            features = scaler.fit_transform(features).tolist()
        else:
            # Create a dummy feature of 1.0 (shape N x 1)
            features = [[1.0]] * num_nodes
            
        # 3. Process Labels
        labels = [0] * num_nodes
        num_classes = 1
        if m.node_label and m.node_label in df_nodes.columns:
            encoder = LabelEncoder()
            labels = encoder.fit_transform(df_nodes[m.node_label].fillna('Unknown')).astype(int).tolist()
            num_classes = len(encoder.classes_)



        # 4. Extract Graphs for Output JSON 
        # (For Demo purpose, Frontend uses 'graph_json' to display the layout)
        # We generate a generic NetworkX graph to calculate basic properties if needed
        # In actual PyG build, we'll save this config on disk. Here we just return the JSON for the frontend to render.
        
        edges_json = []
        for _, row in df_edges.iterrows():
            edges_json.append({"source": row['_internal_source'], "target": row['_internal_target']})

        nodes_json = []
        # Need degrees for layout logic 
        G = nx.Graph()
        G.add_nodes_from(range(num_nodes))
        G.add_edges_from([(e['source'], e['target']) for e in edges_json])
        deg_map = dict(G.degree())

        sorted_nodes = df_nodes.sort_values('_internal_id').reset_index(drop=True)
        for i in range(num_nodes):
            nodes_json.append({
                "id": i,
                "degree": deg_map.get(i, 0),
                "groundTruth": labels[i] if len(labels) > i else 0,
                "inTrainSet": True,  # Simplification for demo
            })

        graph_json = {
            "graphData": {
                "nodes": nodes_json,
                "links": edges_json
            },
            "groundTruth": labels
        }
        
        # If it's a Graph Level task, structure changes slightly (multiple isolated graphs)
        if m.task in [2, 6] and m.graph_id:
            df_nodes[m.graph_id] = df_nodes[m.graph_id].fillna(0).astype(int)
            graph_json["graphs"] = []
            for gid, group in df_nodes.groupby(m.graph_id):
                n_list = [{"id": int(row['_internal_id'])} for _, row in group.iterrows()]
                sub_nodes = set([n['id'] for n in n_list])
                e_list = [e for e in edges_json if e['source'] in sub_nodes and e['target'] in sub_nodes]
                graph_json["graphs"].append({
                    "id": int(gid),
                    "nodes": n_list,
                    "links": e_list,
                    "groundTruth": 0, # Should be extracted from graphs.xlsx
                    "numNodes": len(n_list),
                    "numEdges": len(e_list)
                })

        # ── Database Persistence ──────────────────────────────────────────
        from database.mysql import AsyncSessionLocal
        from database.models import Project, Dataset
        from sqlalchemy import select

        project_id = None
        dataset_id = f"upload_{uuid.uuid4().hex[:8]}"
        try:
            async with AsyncSessionLocal() as session:
                # Find or create Project
                stmt = select(Project).where(Project.name == payload.project_name)
                res = await session.execute(stmt)
                proj = res.scalars().first()
                if not proj:
                    proj = Project(name=payload.project_name, description=f"Custom dataset · Task {m.task}")
                    session.add(proj)
                    await session.commit()
                    await session.refresh(proj)
                project_id = proj.id

                # Create Dataset record
                ds = Dataset(
                    id=dataset_id,
                    project_id=project_id,
                    name=payload.project_name,
                    source_type="upload",
                    column_mapping=m.dict(),
                    node_count=num_nodes,
                    edge_count=num_edges,
                    feature_dim=len(m.node_features) if m.node_features else 1,
                    num_classes=num_classes
                )
                session.add(ds)
                proj.total_runs = (proj.total_runs or 0) + 1
                await session.commit()
        except Exception as db_err:
            print(f"Warning: DB persistence failed: {db_err}")
            # Non-fatal — graph viz still works without DB

        # ── PyG Data Object (for training) ────────────────────────────────
        x_tensor = torch.tensor(features, dtype=torch.float)
        y_tensor = torch.tensor(labels, dtype=torch.long)
        edge_index_tensor = torch.tensor([
            [int(e['source']) for e in edges_json],
            [int(e['target']) for e in edges_json]
        ], dtype=torch.long)

        n = num_nodes
        perm = np.random.permutation(n)
        train_mask = torch.zeros(n, dtype=torch.bool)
        val_mask   = torch.zeros(n, dtype=torch.bool)
        test_mask  = torch.zeros(n, dtype=torch.bool)
        train_mask[perm[:int(0.6 * n)]] = True
        val_mask[perm[int(0.6 * n):int(0.8 * n)]] = True
        test_mask[perm[int(0.8 * n):]] = True

        data_obj = Data(
            x=x_tensor,
            edge_index=edge_index_tensor,
            y=y_tensor,
            train_mask=train_mask,
            val_mask=val_mask,
            test_mask=test_mask
        )

        # Store in-memory for training
        from data.loaders import CUSTOM_DATASETS
        CUSTOM_DATASETS[dataset_id] = data_obj

        return {
            "status": "success",
            "dataset_id": dataset_id,
            "project_id": project_id,
            "project_name": payload.project_name,
            "metadata": {
                "task": m.task,
                "num_nodes": num_nodes,
                "num_edges": num_edges,
                "num_features": len(features[0]) if features else 1,
                "num_classes": num_classes
            },
            "graph_json": graph_json
        }
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
