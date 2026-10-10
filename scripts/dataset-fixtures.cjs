// Representative acceptance data. The previously mentioned 50-ticket fixture
// was not present in this checkout, so these examples are reproducible stand-ins.
const templates = [
  { category: "billing", priority: "medium", sentiment: -0.5, route_to_team: "billing", text: (n) => `My invoice ${n} contains two charges for one payment. Please refund the duplicate charge and confirm when the adjustment will arrive.` },
  { category: "bug", priority: "high", sentiment: -0.7, route_to_team: "engineering", text: (n) => `Since release ${n}, the dashboard returns an HTTP 500 error whenever we open reports. Our team cannot complete today's work. Please investigate the defect.` },
  { category: "feature_request", priority: "low", sentiment: 0.2, route_to_team: "support", text: (n) => `Would you consider adding bulk CSV export for project ${n}? This would be a useful improvement for our weekly workflow, but there is no deadline.` },
  { category: "churn_risk", priority: "high", sentiment: -0.9, route_to_team: "support", text: (n) => `We are seriously considering cancelling our subscription after case ${n}. Repeated poor service has left us frustrated; please contact us before we move to a competitor.` },
  { category: "spam", priority: "low", sentiment: 0, route_to_team: "trust_and_safety", text: (n) => `Exclusive marketing offer ${n}! Buy backlinks and promotional placements today. Click the unrelated sales link to claim your discount.` },
];

function ticketItems() {
  return templates.flatMap((group, groupIndex) => Array.from({ length: 10 }, (_, index) => ({
    id: `${group.category}-${String(index + 1).padStart(2, "0")}`,
    input: group.text(groupIndex * 10 + index + 1),
    expected: { category: group.category, priority: group.priority, sentiment: group.sentiment, route_to_team: group.route_to_team },
  })));
}

module.exports = { ticketItems };
if (require.main === module) process.stdout.write(JSON.stringify(ticketItems(), null, 2) + "\n");
