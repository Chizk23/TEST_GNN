"""
Task 4: Community Detection (Unsupervised)
GNN learns embeddings that maximize modularity.
Nodes physically separate into "Islands" based on predicted communities.
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
import networkx as nx
from sklearn.cluster import KMeans
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.utils import to_networkx

class CommunityGNN(torch.nn.Module):
    def __init__(self, in_channels, hidden=64, out_channels=32, model_type='GCN'):
        super().__init__()
        self.model_type = model_type
        if model_type == 'GAT':
            self.conv1 = GATConv(in_channels, hidden, heads=4, concat=True)
            self.conv2 = GATConv(hidden * 4, out_channels, heads=1, concat=False)
        elif model_type == 'SAGE':
            self.conv1 = SAGEConv(in_channels, hidden)
            self.conv2 = SAGEConv(hidden, out_channels)
        else:
            self.conv1 = GCNConv(in_channels, hidden)
            self.conv2 = GCNConv(hidden, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=0.2, training=self.training)
        z = self.conv2(x, edge_index)
        return z

def calculate_modularity(G, community_map):
    """Calculate the Modularity Q score of the partition."""
    try:
        communities = {}
        for node, cid in community_map.items():
            if cid not in communities: communities[cid] = set()
            communities[cid].add(node)
        return nx.community.modularity(G, list(communities.values()))
    except:
        return 0.0

async def run_community_detection(config, data, model_type, websocket, stop_flag):
    epochs = config.get('epochs', 100)
    num_nodes = data.x.size(0)
    
    # Generate a graph with community structure (Stochastic Block Model)
    # We'll use the existing data but treat it as unsupervised
    G = to_networkx(data, to_undirected=True)
    
    model = CommunityGNN(data.x.size(1), model_type=model_type)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # Send initial graph structure
    await websocket.send_json({
        'type': 'graph_data',
        'data': {
            'graphData': {
                'nodes': [{'id': i} for i in range(num_nodes)],
                'links': [{'source': int(u), 'target': int(v)} for u, v in G.edges()]
            }
        }
    })

    epoch_snapshots = []
    num_communities = 4 # Target islands

    for epoch in range(epochs):
        if stop_flag(): break
        
        model.train()
        optimizer.zero_grad()
        z = model(data.x, data.edge_index)
        
        # Deep Cluster Loss (Simple implementation: attract connected nodes)
        row, col = data.edge_index
        pos_loss = -torch.log(torch.sigmoid((z[row] * z[col]).sum(dim=1)) + 1e-15).mean()
        loss = pos_loss
        loss.backward()
        optimizer.step()
        
        # Inference
        model.eval()
        with torch.no_grad():
            z = model(data.x, data.edge_index)
            z_np = z.cpu().numpy()
            
            # Use KMeans to find community islands in embedding space
            kmeans = KMeans(n_clusters=num_communities, n_init=10)
            clusters = kmeans.fit_predict(z_np)
            
            community_map = {i: int(clusters[i]) for i in range(num_nodes)}
            q_score = calculate_modularity(G, community_map)
            
            # Detect bridge nodes (nodes with neighbors in different communities)
            bridge_flags = []
            for i in range(num_nodes):
                neighbors = list(G.neighbors(i))
                neighbor_communities = {community_map[n] for n in neighbors}
                is_bridge = len(neighbor_communities) > 1
                bridge_flags.append(is_bridge)

        snapshot = {
            'epoch': epoch,
            'node_predictions': clusters.tolist(), # Community IDs
            'bridge_nodes': bridge_flags,
            'modularity_q': q_score,
            'train_loss': float(loss.item()),
            'val_acc': q_score # Show Q in the accuracy slot
        }
        epoch_snapshots.append(snapshot)
        
        await websocket.send_json({
            'type': 'epoch_snapshot',
            'data': snapshot,
            'progress': (epoch + 1) / epochs
        })
        await asyncio.sleep(0.005)
        
    return epoch_snapshots
