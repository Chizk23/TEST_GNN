import torch
from torch_geometric.datasets import Planetoid
import os
import pandas as pd
import numpy as np
from torch_geometric.data import Data

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'datasets')
CUSTOM_DATASETS = {}


def load_cora():
    """Load Cora citation dataset."""
    dataset = Planetoid(root=DATA_DIR, name='Cora')
    return dataset[0]


def load_citeseer():
    """Load Citeseer citation dataset."""
    dataset = Planetoid(root=DATA_DIR, name='CiteSeer')
    return dataset[0]


def load_csv(nodes_path: str, edges_path: str):
    """Load custom dataset from CSV files.

    nodes.csv: columns = [node_id, feature_0, feature_1, ..., label]
    edges.csv: columns = [source, target]
    """
    nodes_df = pd.read_csv(nodes_path)
    edges_df = pd.read_csv(edges_path)

    # Extract features and labels
    feature_cols = [c for c in nodes_df.columns if c not in ('node_id', 'label')]
    x = torch.tensor(nodes_df[feature_cols].values, dtype=torch.float)
    y = torch.tensor(nodes_df['label'].values, dtype=torch.long)

    # Build edge index
    edge_index = torch.tensor(
        [edges_df['source'].values, edges_df['target'].values],
        dtype=torch.long
    )

    # Create masks (random 60/20/20 split)
    n = len(nodes_df)
    perm = np.random.permutation(n)
    train_mask = torch.zeros(n, dtype=torch.bool)
    val_mask = torch.zeros(n, dtype=torch.bool)
    test_mask = torch.zeros(n, dtype=torch.bool)
    train_mask[perm[:int(0.6 * n)]] = True
    val_mask[perm[int(0.6 * n):int(0.8 * n)]] = True
    test_mask[perm[int(0.8 * n):]] = True

    data = Data(x=x, edge_index=edge_index, y=y,
                train_mask=train_mask, val_mask=val_mask, test_mask=test_mask)
    return data


def get_available_datasets():
    """Return list of built-in datasets."""
    return ['cora', 'citeseer']
