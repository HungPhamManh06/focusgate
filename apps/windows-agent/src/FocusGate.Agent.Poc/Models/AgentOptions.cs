namespace FocusGate.Agent.Poc.Models;

/// <summary>What the proof of concept does with a blocked foreground application.</summary>
public enum EnforcementAction
{
    Log = 0,
    Minimize = 1,
    Terminate = 2,
    Overlay = 3,
}

public enum AgentMode
{
    Help,
    List,
    SelfTest,
    Monitor,
    WindowProbe,
    Tray,
    Status,
}

/// <summary>Command-line configuration for the PoC (no config file required).</summary>
public sealed class AgentOptions
{
    public AgentMode Mode { get; init; } = AgentMode.Help;
    public int Seconds { get; init; } = 20;
    public EnforcementAction Enforcement { get; init; } = EnforcementAction.Log;
    public string PolicyPath { get; init; } = "poc-policy.json";
    public string DatabasePath { get; init; } =
        Path.Combine("agent-poc-data", "focusgate-poc.db");
    public string ApiBaseUrl { get; init; } = "http://localhost:3000";
    public string? DeviceName { get; init; }

    public static AgentOptions Parse(string[] args)
    {
        var mode = AgentMode.Help;
        var enforcement = EnforcementAction.Log;
        var seconds = 20;
        var policy = "poc-policy.json";
        var database = Path.Combine("agent-poc-data", "focusgate-poc.db");
        var apiUrl = Environment.GetEnvironmentVariable("FOCUSGATE_API_URL") ?? "http://localhost:3000";
        string? deviceName = null;

        for (var i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            switch (arg)
            {
                case "--help" or "-h" or "help":
                    mode = AgentMode.Help;
                    break;
                case "--selftest":
                    mode = AgentMode.SelfTest;
                    break;
                case "--list":
                    mode = AgentMode.List;
                    break;
                case "--monitor":
                    mode = AgentMode.Monitor;
                    break;
                case "--window-probe":
                    // Internal: used by --selftest to verify cross-process window control.
                    mode = AgentMode.WindowProbe;
                    break;
                case "--seconds":
                    seconds = ReadInt(args, ref i, arg, 1, 3600);
                    break;
                case "--enforce":
                    mode = AgentMode.Monitor;
                    enforcement = ReadEnforcement(args, ref i, arg);
                    break;
                case "--policy":
                    policy = ReadValue(args, ref i, arg);
                    break;
                case "--db":
                    database = ReadValue(args, ref i, arg);
                    break;
                case "--tray":
                    mode = AgentMode.Tray;
                    break;
                case "--status":
                    mode = AgentMode.Status;
                    break;
                case "--api-url":
                    apiUrl = ReadValue(args, ref i, arg);
                    break;
                case "--device-name":
                    deviceName = ReadValue(args, ref i, arg);
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {arg}");
            }
        }

        return new AgentOptions
        {
            Mode = mode,
            Seconds = seconds,
            Enforcement = enforcement,
            PolicyPath = policy,
            DatabasePath = database,
            ApiBaseUrl = apiUrl,
            DeviceName = deviceName,
        };
    }

    public static void PrintHelp()
    {
        Console.WriteLine(
            """
            FocusGate Windows Agent – Phase 0 proof of concept

              --selftest                  Probe OS capabilities (foreground hook, process
                                          rights, UWP app identity, SQLite, minimize test).
              --list                      List interactive processes currently on screen.
              --monitor [--seconds N]     Observe foreground apps for N seconds (default 20).
              --window-probe              Internal probe window used by --selftest.
              --enforce log|minimize|terminate|overlay
                                          Enforcement used with --monitor. Default: log
                                          (observe only, never touches other apps).
              --policy <path>             JSON policy file (default poc-policy.json).
              --db <path>                 SQLite event log path.
              --tray                      Start the Phase 1.4 system tray agent shell.
              --status                    Print DPAPI credential & registration status.
              --api-url <url>             Web API origin (default http://localhost:3000).
              --device-name <name>        Override local device name.
              -h, --help                  This text.

            The PoC never blocks anything unless --enforce is passed explicitly.
            It only inspects the foreground window and process list.
            """);
    }

    private static string ReadValue(string[] args, ref int i, string name)
    {
        if (i + 1 >= args.Length) throw new ArgumentException($"{name} requires a value.");
        return args[++i];
    }

    private static int ReadInt(string[] args, ref int i, string name, int min, int max)
    {
        var raw = ReadValue(args, ref i, name);
        if (!int.TryParse(raw, out var value) || value < min || value > max)
        {
            throw new ArgumentException($"{name} must be an integer between {min} and {max}.");
        }
        return value;
    }

    private static EnforcementAction ReadEnforcement(string[] args, ref int i, string name)
    {
        var raw = ReadValue(args, ref i, name).ToLowerInvariant();
        return raw switch
        {
            "log" => EnforcementAction.Log,
            "minimize" => EnforcementAction.Minimize,
            "terminate" => EnforcementAction.Terminate,
            "overlay" => EnforcementAction.Overlay,
            _ => throw new ArgumentException(
                $"{name} must be one of: log, minimize, terminate, overlay."),
        };
    }
}
