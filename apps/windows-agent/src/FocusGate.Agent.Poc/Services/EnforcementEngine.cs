using FocusGate.Agent.Poc.Models;

namespace FocusGate.Agent.Poc.Services;

public sealed record EnforcementDecision(bool ShouldBlock, string? Category, string Reason);

/// <summary>
/// Pure decision logic: given an observation and a policy, decide whether it is
/// blocked. Kept free of OS side effects so it is testable and reusable by the
/// real agent (where the policy comes from the backend).
/// </summary>
public sealed class EnforcementEngine
{
    private volatile BlockPolicy _policy;

    public EnforcementEngine(BlockPolicy policy) => _policy = policy;

    public void UpdatePolicy(BlockPolicy policy)
    {
        ArgumentNullException.ThrowIfNull(policy);
        _policy = policy;
    }

    public EnforcementDecision Evaluate(ForegroundApp app)
    {
        var policy = _policy;
        if (app.ProcessId == Environment.ProcessId)
        {
            return new EnforcementDecision(false, null, "own process");
        }

        if (policy.IsAllowlisted(app))
        {
            return new EnforcementDecision(false, null, "allowlisted");
        }

        var match = policy.Match(app);
        if (match is null)
        {
            return new EnforcementDecision(false, null, "not in block list");
        }

        return new EnforcementDecision(true, match.Category, $"matched category '{match.Category}'");
    }
}
