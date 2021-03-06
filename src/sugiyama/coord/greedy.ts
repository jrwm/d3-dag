/**
 * This accessor assigns coordinates as the mean of their parents and then
 * spaces them out to respect their separation. Nodes with higher degree that
 * aren't dummy nodes are given higher priority for shifting order, i.e. are
 * less likely to be moved from the mean of their parents. This solution
 * results in a layout that is more pleaseing than center, but much faster to
 * compute than vert or minCurve.
 *
 * <img alt="greedy example" src="media://greedy_coordinate.png" width="400">
 *
 * @packageDocumentation
 */

// TODO add assignment like mean that skips dummy nodes as that seems like
// better behavior

import { HorizableNode, Operator, Separation } from ".";
import { SafeMap, def } from "../../utils";

import { DagNode } from "../../dag/node";
import { DummyNode } from "../dummy";

export type GreedyOperator<NodeType extends DagNode> = Operator<NodeType>;

/** Create a greedy coordinate assignment operator. */
export function greedy<NodeType extends DagNode>(
  ...args: never[]
): GreedyOperator<NodeType> {
  if (args.length) {
    throw new Error(
      `got arguments to greedy(${args}), but constructor takes no aruguments.`
    );
  }

  function greedyCall(
    layers: ((NodeType & HorizableNode) | DummyNode)[][],
    separation: Separation<NodeType>
  ): void {
    // TODO other initial assignments
    const assignment = meanAssignment;

    // assign degrees
    const degrees = new SafeMap<string, number>();
    for (const layer of layers) {
      for (const node of layer) {
        // the -3 at the end ensures that dummy nodes have the lowest priority,
        // as dummy nodes always have degree 2, degree -1 ensures they are
        // below any other valid node
        degrees.set(
          node.id,
          node.ichildren().length + (node instanceof DummyNode ? -3 : 0)
        );
      }
    }
    for (const layer of layers) {
      for (const node of layer) {
        for (const child of node.ichildren()) {
          degrees.set(child.id, degrees.getThrow(child.id) + 1);
        }
      }
    }

    // set first layer
    let [lastLayer, ...restLayers] = layers;
    let [last, ...rest] = lastLayer;
    let lastX = (last.x = 0);
    for (const node of rest) {
      lastX = node.x = lastX + separation(last, node);
      last = node;
    }

    // assign the rest of nodes
    for (const layer of restLayers) {
      // initial greedy assignment
      assignment(lastLayer, layer);

      // order nodes nodes by degree and start with highest degree
      const ordered = layer
        .map(
          (node, j) =>
            [j, node] as [number, (NodeType & HorizableNode) | DummyNode]
        )
        .sort(([aj, anode], [bj, bnode]) => {
          const adeg = degrees.getThrow(anode.id);
          const bdeg = degrees.getThrow(bnode.id);
          return adeg === bdeg ? aj - bj : bdeg - adeg;
        });
      // Iterate over nodes in degree order
      for (const [j, node] of ordered) {
        // first push nodes over to left
        // TODO we do left than right, but really we should do both and average
        let last = node;
        let lastX = def(last.x);
        for (const next of layer.slice(j + 1)) {
          lastX = next.x = Math.max(
            def(next.x),
            lastX + separation(last, next)
          );
          last = next;
        }
        // then push from the right
        last = node;
        lastX = def(last.x);
        for (const next of layer.slice(0, j).reverse()) {
          lastX = next.x = Math.min(
            def(next.x),
            lastX - separation(next, last)
          );
          last = next;
        }
      }

      lastLayer = layer;
    }

    // scale
    const min = Math.min(
      ...layers.map((layer) => Math.min(...layer.map((node) => def(node.x))))
    );
    const span =
      Math.max(
        ...layers.map((layer) => Math.max(...layer.map((node) => def(node.x))))
      ) - min;
    if (span > 0) {
      for (const layer of layers) {
        for (const node of layer) {
          node.x = (def(node.x) - min) / span;
        }
      }
    } else {
      for (const layer of layers) {
        for (const node of layer) {
          node.x = 0.5;
        }
      }
    }
  }

  return greedyCall;
}

// TODO this is very similar to the twolayerMean method, there might be a
// clever way to combine then, but it's not immediately obvious since twolayer
// uses the index of toplayer, and this uses the x value
/** @internal */
function meanAssignment<NodeType extends (DagNode & HorizableNode) | DummyNode>(
  topLayer: NodeType[],
  bottomLayer: NodeType[]
): void {
  for (const node of bottomLayer) {
    node.x = 0.0;
  }
  const counts = new SafeMap<string, number>();
  for (const node of topLayer) {
    for (const child of node.ichildren()) {
      /* istanbul ignore next */
      if (child.x === undefined) {
        throw new Error(`unexpected undefined x for '${child.id}'`);
      }
      const newCount = counts.getDefault(child.id, 0) + 1;
      counts.set(child.id, newCount);
      child.x += (def(node.x) - child.x) / newCount;
    }
  }
}
