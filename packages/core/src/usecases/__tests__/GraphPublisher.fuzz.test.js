function expectTopological(order, graph, label) {
  const rank = new Map(order.map((id, index) => [id, index]));
  for (const edge of graph.edges) {
    // A narrow cache commit intentionally publishes only the changed target
    // closure. An edge whose source or target stayed cached is not an order
    // violation because one endpoint is absent from this publish pass.
    if (!rank.has(edge.source) || !rank.has(edge.target)) continue;
    expect(
      rank.get(edge.source) < rank.get(edge.target),
      `${label}: ${edge.source} is not ordered before ${edge.target}`,
    ).toBe(true);
  }
}
