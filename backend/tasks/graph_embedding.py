import asyncio
import numpy as np
import torch
import torch.nn.functional as F
from concurrent.futures import ThreadPoolExecutor
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.metrics import roc_auc_score
from sklearn.neighbors import NearestNeighbors
from sklearn.cluster import KMeans
from torch_geometric.utils import negative_sampling

# Executor for CPU-bound tasks
executor = ThreadPoolExecutor(max_workers=2)

def compute_metrics_sync(z_np, num_nodes, node_indices, adj_sets, edge_index_np, last_tsne, epoch, epochs):
    """CPU-bound metrics and projections."""
    # NaN guard
    if not np.all(np.isfinite(z_np)):
        z_np = np.nan_to_num(z_np, nan=0.0, posinf=1.0, neginf=-1.0)

    # 1. Projections
    try:
        pca = PCA(n_components=2)
        emb_pca = pca.fit_transform(z_np).tolist()
    except:
        emb_pca = [[0.0, 0.0] for _ in range(num_nodes)]
    
    emb_tsne = last_tsne
    if epoch % 5 == 0 or epoch == epochs - 1 or last_tsne is None:
        try:
            # Fewer iterations for t-SNE to keep it responsive
            tsne = TSNE(n_components=2, perplexity=min(30, num_nodes-1), n_iter=250)
            emb_tsne = tsne.fit_transform(z_np).tolist()
        except:
            emb_tsne = last_tsne if last_tsne else emb_pca

    # 2. k-NN Preservation
    k = 5
    knn_pres = 0.0
    try:
        knn = NearestNeighbors(n_neighbors=k+1).fit(z_np)
        _, indices = knn.kneighbors(z_np[node_indices])
        pres_scores = []
        for i, idx in enumerate(node_indices):
            neighbors_in_graph = adj_sets[idx]
            if not neighbors_in_graph: continue
            neighbors_in_emb = set(indices[i, 1:])
            intersection = neighbors_in_graph.intersection(neighbors_in_emb)
            pres_scores.append(len(intersection) / min(k, len(neighbors_in_graph)))
        knn_pres = float(np.mean(pres_scores)) if pres_scores else 0.0
    except: pass

    # 3. Clustering
    clusters = [0] * num_nodes
    try:
        kmeans = KMeans(n_clusters=min(4, num_nodes), n_init=3)
        clusters = kmeans.fit_predict(z_np).tolist()
    except: pass

    return emb_pca, emb_tsne, knn_pres, clusters

async def run_graph_embedding(config, data, model_type, websocket, stop_flag):
    epochs = config.get('epochs', 50)
    lr = config.get('lr', 0.01)
    hidden = config.get('hidden', 64)
    num_nodes = data.x.size(0)
    edge_index = data.edge_index

    # Respect model_type (GCN, GAT, SAGE)
    from main import build_model
    model = build_model(config, data=data, num_classes=hidden) # out_channels = hidden for embeddings
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    
    # Pre-calculate adjacency
    eval_nodes = min(num_nodes, 300)
    node_indices = np.random.choice(num_nodes, eval_nodes, replace=False)
    adj_sets = [set() for _ in range(num_nodes)]
    edge_index_np = edge_index.cpu().numpy()
    for i in range(edge_index_np.shape[1]):
        u, v = edge_index_np[0, i], edge_index_np[1, i]
        adj_sets[u].add(v)
        adj_sets[v].add(u)

    epoch_snapshots = []
    last_tsne = None
    loop = asyncio.get_event_loop()

    for epoch in range(epochs):
        if stop_flag(): break
            
        model.train()
        optimizer.zero_grad()
        
        # Forward pass
        outputs = model(data.x, edge_index)
        z = outputs[1] # Embedding is typically the 2nd return
        
        neg_edge_index = negative_sampling(edge_index, num_nodes, edge_index.size(1))
        pos_logits = (z[edge_index[0]] * z[edge_index[1]]).sum(dim=1)
        neg_logits = (z[neg_edge_index[0]] * z[neg_edge_index[1]]).sum(dim=1)
        
        loss = F.binary_cross_entropy_with_logits(pos_logits, torch.ones_like(pos_logits)) + \
               F.binary_cross_entropy_with_logits(neg_logits, torch.zeros_like(neg_logits))
        
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        # Evaluation
        model.eval()
        with torch.no_grad():
            _, z_eval = model(data.x, edge_index)
            z_np = z_eval.cpu().numpy()
            
            # Offload heavy CPU tasks to thread
            emb_pca, emb_tsne, knn_pres, clusters = await loop.run_in_executor(
                executor, compute_metrics_sync, z_np, num_nodes, node_indices, 
                adj_sets, edge_index_np, last_tsne, epoch, epochs
            )
            last_tsne = emb_tsne

            # Quick AUC calc
            num_auc = min(1000, edge_index.size(1))
            pos_idx = np.random.choice(edge_index.size(1), num_auc)
            neg_idx = negative_sampling(edge_index, num_nodes, num_auc)
            p_s = torch.sigmoid((z_eval[edge_index[0, pos_idx]] * z_eval[edge_index[1, pos_idx]]).sum(dim=1))
            n_s = torch.sigmoid((z_eval[neg_idx[0]] * z_eval[neg_idx[1]]).sum(dim=1))
            auc = float(roc_auc_score(np.concatenate([np.ones(num_auc), np.zeros(num_auc)]),
                                    np.concatenate([p_s.cpu().numpy(), n_s.cpu().numpy()])))

        snapshot = {
            'epoch': epoch,
            'node_predictions': clusters,
            'embeddings_2d': emb_pca,
            'tsne_2d': emb_tsne,
            'knn_preservation': knn_pres,
            'link_recon_auc': auc,
            'train_loss': float(loss.item()),
            'val_loss': float(loss.item()),
            'val_acc': auc,
        }
        epoch_snapshots.append(snapshot)
        await websocket.send_json({'type': 'epoch_snapshot', 'data': snapshot, 'progress': (epoch+1)/epochs})
        await asyncio.sleep(0.01)

    return epoch_snapshots
