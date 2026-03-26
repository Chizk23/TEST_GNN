"""
Task 3: Link Prediction
Trains a GCN encoder + MLP decoder to predict missing edges.
Includes Structural Feature Fusion (AA, CN) and Hard Negative Sampling.
"""
import asyncio
import numpy as np
import torch
import torch.nn.functional as F
import random
import networkx as nx
from sklearn.decomposition import PCA
from sklearn.metrics import roc_auc_score
from torch_geometric.nn import GCNConv
from torch_geometric.utils import negative_sampling

# ───────────────────────────────────────────────────────────────────────────────
# Link Prediction Model (GCN Encoder + MLP Decoder)
# ───────────────────────────────────────────────────────────────────────────────
class MLPDecoder(torch.nn.Module):
    def __init__(self, in_channels, hidden=32):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(in_channels * 2 + 2, hidden), # +2 for structural info (AA, CN)
            torch.nn.ReLU(),
            torch.nn.Linear(hidden, 1)
        )

    def forward(self, z_src, z_tgt, structural_features=None):
        combined = torch.cat([z_src, z_tgt], dim=-1)
        if structural_features is not None:
            combined = torch.cat([combined, structural_features], dim=-1)
        return self.net(combined).squeeze()

class LinkPredModel(torch.nn.Module):
    def __init__(self, in_channels, hidden=64):
        super().__init__()
        self.conv1 = GCNConv(in_channels, hidden)
        self.conv2 = GCNConv(hidden, hidden)
        self.decoder = MLPDecoder(hidden, hidden // 2)

    def encode(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=0.4, training=self.training)
        z = self.conv2(x, edge_index)
        return z

    def decode(self, z, edge_index, structural_features=None):
        src, tgt = edge_index
        return self.decoder(z[src], z[tgt], structural_features)

    def forward(self, x, edge_index, pos_edge, neg_edge, pos_struct=None, neg_struct=None):
        z = self.encode(x, edge_index)
        pos_score = self.decode(z, pos_edge, pos_struct)
        neg_score = self.decode(z, neg_edge, neg_struct)
        return pos_score, neg_score, z

# ───────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────────────────────
def compute_structural_features(edge_index, num_nodes):
    """Compute Adamic-Adar and Common Neighbors for edges."""
    G = nx.Graph()
    G.add_nodes_from(range(num_nodes))
    edges = edge_index.t().tolist()
    G.add_edges_from(edges)
    
    # AA and CN
    aa = list(nx.adamic_adar_index(G, edges))
    cn = []
    for u, v in edges:
        cn.append(len(list(nx.common_neighbors(G, u, v))))
        
    aa_scores = np.array([s for u, v, s in aa])
    cn_scores = np.array(cn)
    
    if len(aa_scores) > 0:
        aa_min, aa_max = aa_scores.min(), aa_scores.max()
        aa_scores = (aa_scores - aa_min) / (aa_max - aa_min + 1e-6)
        cn_min, cn_max = cn_scores.min(), cn_scores.max()
        cn_scores = (cn_scores - cn_min) / (cn_max - cn_min + 1e-6)
    
    return torch.tensor(np.stack([aa_scores, cn_scores], axis=1), dtype=torch.float)

def sample_hard_negatives(train_edges, num_nodes, num_samples):
    """Sample negatives from 2-hop neighbors (Harder cases)."""
    G = nx.Graph()
    G.add_nodes_from(range(num_nodes))
    G.add_edges_from(train_edges.t().tolist())
    
    neg_edges = []
    nodes = list(range(num_nodes))
    random.shuffle(nodes)
    
    for u in nodes:
        if len(neg_edges) >= num_samples:
            break
        neighbors = set(G.neighbors(u))
        two_hop = set()
        for v in neighbors:
            two_hop.update(G.neighbors(v))
        
        candidates = list(two_hop - neighbors - {u})
        if candidates:
            v_neg = random.choice(candidates)
            neg_edges.append([u, v_neg])
            
    if len(neg_edges) < num_samples:
        extra = negative_sampling(train_edges, num_nodes, num_samples - len(neg_edges))
        neg_edges.extend(extra.t().tolist())
        
    return torch.tensor(neg_edges[:num_samples]).t().to(train_edges.device)

def split_edges(edge_index, val_ratio=0.1, test_ratio=0.1):
    num_edges = edge_index.size(1)
    perm = torch.randperm(num_edges)
    n_test = max(1, int(num_edges * test_ratio))
    n_val = max(1, int(num_edges * val_ratio))
    test_edges = edge_index[:, perm[:n_test]]
    val_edges = edge_index[:, perm[n_test:n_test + n_val]]
    train_edges = edge_index[:, perm[n_test + n_val:]]
    return train_edges, val_edges, test_edges

# ───────────────────────────────────────────────────────────────────────────────
# Main Training Loop
# ───────────────────────────────────────────────────────────────────────────────
async def run_link_prediction(config, data, model_type, websocket, stop_flag):
    epochs = config.get('epochs', 80)
    num_nodes = data.x.size(0)
    num_features = data.x.size(1)
    edge_index = data.edge_index

    # Split
    train_edges, val_edges, test_edges = split_edges(edge_index, val_ratio=0.1, test_ratio=0.15)

    # Initial graph data for frontend
    train_edge_np = train_edges.cpu().numpy()
    links_json = []
    seen = set()
    for i in range(train_edge_np.shape[1]):
        s, t = int(train_edge_np[0, i]), int(train_edge_np[1, i])
        key = (min(s, t), max(s, t))
        if key not in seen:
            seen.add(key)
            links_json.append({'source': s, 'target': t})

    degrees = np.zeros(num_nodes)
    for link in links_json:
        degrees[link['source']] += 1
        degrees[link['target']] += 1
    nodes_json = [{'id': i, 'degree': int(degrees[i])} for i in range(num_nodes)]

    # Test edges
    n_pos = min(test_edges.size(1), 60)
    neg_test = negative_sampling(edge_index, num_nodes, n_pos)
    n_neg = neg_test.size(1)

    test_edges_json = []
    pos_np = test_edges[:, :n_pos].cpu().numpy()
    neg_np = neg_test.cpu().numpy()
    for i in range(n_pos):
        test_edges_json.append({'source': int(pos_np[0, i]), 'target': int(pos_np[1, i]), 'exists': True, 'idx': i})
    for i in range(n_neg):
        test_edges_json.append({'source': int(neg_np[0, i]), 'target': int(neg_np[1, i]), 'exists': False, 'idx': i + n_pos})

    await websocket.send_json({
        'type': 'graph_data',
        'data': {
            'graphData': {'nodes': nodes_json, 'links': links_json},
            'groundTruth': data.y.cpu().tolist(),
            'testEdges': test_edges_json,
        }
    })

    # Prepare features
    train_struct = compute_structural_features(train_edges, num_nodes)
    test_struct = compute_structural_features(test_edges[:, :n_pos], num_nodes)
    neg_test_struct = compute_structural_features(neg_test, num_nodes)

    model = LinkPredModel(num_features, 64)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.get('lr', 0.01))
    margin = 1.0
    epoch_snapshots = []

    for epoch in range(epochs):
        if stop_flag(): break

        model.train()
        optimizer.zero_grad()
        neg_edge = sample_hard_negatives(train_edges, num_nodes, train_edges.size(1))
        neg_struct = compute_structural_features(neg_edge, num_nodes)

        pos_score, neg_score, z = model(data.x, train_edges, train_edges, neg_edge, train_struct, neg_struct)
        loss = torch.mean(F.relu(margin - pos_score + neg_score))
        loss.backward()
        optimizer.step()

        model.eval()
        with torch.no_grad():
            z = model.encode(data.x, train_edges)
            pos_test_score = model.decode(z, test_edges[:, :n_pos], test_struct).sigmoid()
            neg_test_score = model.decode(z, neg_test, neg_test_struct).sigmoid()

            all_scores = torch.cat([pos_test_score, neg_test_score]).cpu().numpy()
            all_labels = np.concatenate([np.ones(n_pos), np.zeros(n_neg)])
            auc = float(roc_auc_score(all_labels, all_scores))

            pca = PCA(n_components=2)
            emb_2d = pca.fit_transform(z.cpu().numpy()).tolist()
            edge_scores = pos_test_score.cpu().tolist() + neg_test_score.cpu().tolist()

            # Val
            val_neg = negative_sampling(val_edges, num_nodes, val_edges.size(1))
            val_loss = torch.mean(F.relu(margin - model.decode(z, val_edges, compute_structural_features(val_edges, num_nodes)).sigmoid() + 
                                       model.decode(z, val_neg, compute_structural_features(val_neg, num_nodes)).sigmoid()))

        snapshot = {
            'epoch': epoch,
            'edge_scores': edge_scores,
            'embeddings_2d': emb_2d,
            'train_loss': float(loss.item()),
            'val_loss': float(val_loss.item()),
            'auc': auc,
            'train_acc': auc,
            'val_acc': auc,
        }
        epoch_snapshots.append(snapshot)
        await websocket.send_json({'type': 'epoch_snapshot', 'data': snapshot, 'progress': (epoch + 1) / epochs})
        await asyncio.sleep(0.005)

    return epoch_snapshots
