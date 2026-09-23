// Learned-policy terminal rollouts cost more than random rollouts or static leaves.
export const MCTS_TREES = 8;
export const MCTS_ITERATIONS_PER_TREE = 1_000;
// High difficulty uses a wall-clock budget; the fixed-count API stays for tests.
export const MCTS_TIME_BUDGET_MS = 1_000;
