"""OPTIONAL offline node-encoder experiment — NOT part of the live scoring path.

The production mule-ring detector runs on graph topology heuristics
(degree, fan-out, connected-component mass) via backend/graph/mule_detector.py.
This module exists for future offline re-scoring with learned embeddings
(PyTorch Geometric when available, structural fallback otherwise). Nothing in
the request pipeline imports it, and no live claim depends on it.
"""
from __future__ import annotations

from typing import Any

import networkx as nx


def graphsage_available() -> bool:
    try:
        import torch
        import torch_geometric  # noqa: F401

        return True
    except ImportError:
        return False


def encode_nodes(G: nx.Graph, dim: int = 16) -> dict[str, list[float]]:
    if graphsage_available():
        return _torch_geometric_encode(G, dim)
    return _structural_encode(G)


def _structural_encode(G: nx.Graph) -> dict[str, list[float]]:
    """Deterministic structural features: degree, clustering, neighbor-degree."""
    out: dict[str, list[float]] = {}
    max_deg = max((d for _, d in G.degree()), default=1) or 1
    clustering = nx.clustering(G)
    for node in G.nodes:
        nbr_deg = [G.degree(nb) for nb in G.neighbors(node)]
        mean_nbr = sum(nbr_deg) / len(nbr_deg) / max_deg if nbr_deg else 0.0
        out[node] = [round(G.degree(node) / max_deg, 4),
                     round(clustering.get(node, 0.0), 4),
                     round(mean_nbr, 4)]
    return out


def _torch_geometric_encode(G: nx.Graph, dim: int) -> dict[str, list[float]]:
    import numpy as np
    import torch
    from torch_geometric.nn import SAGEConv

    nodes = list(G.nodes)
    index = {n: i for i, n in enumerate(nodes)}
    deg = np.array([G.degree(n) for n in nodes], dtype=float)
    x = torch.tensor(np.stack([deg / (deg.max() or 1), np.ones_like(deg)], axis=1),
                     dtype=torch.float)

    class _SAGE(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.conv1 = SAGEConv(2, dim)

        def forward(self, xv, ei):
            return self.conv1(xv, ei)

    edge_index = torch.tensor([[index[u] for u, _ in G.edges()] +
                               [index[v] for _, v in G.edges()],
                               [index[v] for _, v in G.edges()] +
                               [index[u] for u, _ in G.edges()]], dtype=torch.long)
    model = _SAGE().eval()
    with torch.no_grad():
        emb = model(x, edge_index).numpy()
    return {n: [round(float(v), 4) for v in emb[index[n]]] for n in nodes}
