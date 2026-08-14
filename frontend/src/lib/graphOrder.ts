import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types/workflow";

/**
 * Topologically sorts workflow nodes based on graph edges.
 * Traversal starts at the Trigger node, follows downstream edge connections,
 * and handles branching (e.g. condition nodes) and disconnected nodes safely.
 */
export function getTopologicallySortedNodes<T extends WorkflowNodeData = WorkflowNodeData>(
  nodes: Node<T>[],
  edges: Edge[] = []
): Node<T>[] {
  if (!nodes || nodes.length <= 1) {
    return nodes || [];
  }

  const nodeMap = new Map<string, Node<T>>();
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  // Build graph adjacency list from valid edges between existing nodes
  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  // Priority queue initialization:
  // 1. Trigger nodes first
  // 2. Nodes with in-degree 0
  const queue: string[] = [];
  const visited = new Set<string>();

  const triggerNodes = nodes.filter((n) => n.data?.nodeType === "trigger");
  for (const trigger of triggerNodes) {
    queue.push(trigger.id);
    visited.add(trigger.id);
  }

  // Add any other nodes with 0 in-degree that are not triggers
  for (const node of nodes) {
    if (!visited.has(node.id) && (inDegree.get(node.id) || 0) === 0) {
      queue.push(node.id);
      visited.add(node.id);
    }
  }

  const sortedNodes: Node<T>[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodeMap.get(currentId);
    if (currentNode) {
      sortedNodes.push(currentNode);
    }

    const neighbors = adj.get(currentId) || [];
    for (const neighborId of neighbors) {
      const currentInDegree = (inDegree.get(neighborId) || 1) - 1;
      inDegree.set(neighborId, currentInDegree);

      if (currentInDegree <= 0 && !visited.has(neighborId)) {
        queue.push(neighborId);
        visited.add(neighborId);
      }
    }
  }

  // Append any remaining unvisited nodes (e.g. in cycles or disconnected components)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      sortedNodes.push(node);
      visited.add(node.id);
    }
  }

  return sortedNodes;
}
