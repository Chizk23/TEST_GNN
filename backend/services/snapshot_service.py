from database.mongodb import runs_collection
from typing import List, Dict, Any, Optional

async def save_training_run(mysql_run_id: str, project_id: str, snapshots: List[Dict[str, Any]], best_epoch: int) -> str:
    coll = runs_collection()
    
    # Generate final_summary from best_epoch OR the last epoch
    final_snapshot = next((s for s in snapshots if s.get("epoch") == best_epoch), snapshots[-1] if snapshots else {})
    
    final_summary = {}
    if "embeddings_2d" in final_snapshot:
        final_summary["embeddings_2d"] = final_snapshot["embeddings_2d"]
    if "node_predictions" in final_snapshot:
        final_summary["node_predictions"] = final_snapshot["node_predictions"]
    if "community_ids" in final_snapshot:
        final_summary["community_ids"] = final_snapshot["community_ids"]
    if "modularity_q" in final_snapshot:
        final_summary["modularity_q"] = final_snapshot["modularity_q"]
    if "bridge_nodes" in final_snapshot:
        final_summary["bridge_nodes"] = final_snapshot["bridge_nodes"]
        
    doc = {
        "mysql_run_id": mysql_run_id,
        "project_id": project_id,
        "best_epoch": best_epoch,
        "epoch_snapshots": snapshots,
        "final_summary": final_summary
    }
    
    result = await coll.insert_one(doc)
    return str(result.inserted_id)

async def get_final_summary(mysql_run_id: str) -> Optional[Dict[str, Any]]:
    coll = runs_collection()
    # Only fetch final_summary to keep it blazing fast for previews
    doc = await coll.find_one({"mysql_run_id": mysql_run_id}, {"final_summary": 1, "best_epoch": 1, "_id": 0})
    return doc

async def get_all_snapshots(mysql_run_id: str) -> List[Dict[str, Any]]:
    coll = runs_collection()
    doc = await coll.find_one({"mysql_run_id": mysql_run_id}, {"epoch_snapshots": 1, "_id": 0})
    if doc and "epoch_snapshots" in doc:
        return doc["epoch_snapshots"]
    return []

async def save_layout_positions(mysql_run_id: str, positions: Dict[str, Any]) -> bool:
    """Updates the layout positions in the final_summary for fast preview restoration"""
    coll = runs_collection()
    
    # We store the custom layout directly inside final_summary.layout 
    result = await coll.update_one(
        {"mysql_run_id": mysql_run_id},
        {"$set": {"final_summary.layout": positions}}
    )
    return result.modified_count > 0

