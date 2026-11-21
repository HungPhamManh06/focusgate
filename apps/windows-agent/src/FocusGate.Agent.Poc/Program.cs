using System.Text;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Monitors;
using FocusGate.Agent.Poc.Services;

namespace FocusGate.Agent.Poc;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        AgentOptions options;
        try
        {
            options = AgentOptions.Parse(args);
        }
        catch (ArgumentException ex)
        {
            Console.Error.WriteLine(ex.Message);
            AgentOptions.PrintHelp();
            return 2;
        }

        return options.Mode switch
        {
            AgentMode.Help => Help(),
            AgentMode.List => ListProcesses(),
            AgentMode.SelfTest => SelfTest.Run(options),
            AgentMode.Monitor => RunMonitor(options),
            AgentMode.WindowProbe => RunWindowProbe(),
            _ => 2,
        };
    }

    private static int Help()
    {
        AgentOptions.PrintHelp();
        return 0;
    }

    private static int ListProcesses()
    {
        var processes = ProcessMonitor.EnumerateInteractive();
        Console.WriteLine($"Interactive processes: {processes.Count}");
        Console.WriteLine();
        foreach (var process in processes)
        {
            Console.WriteLine(
                $"{process.ProcessName,-26} pid={process.ProcessId,-7} " +
                $"aumid={(process.AppUserModelId ?? "-"),-40} title={Trim(process.WindowTitle, 50)}");
        }
        return 0;
    }

    /// <summary>
    /// Shows a plain window for 15 seconds. The self-test launches this same
    /// executable as a separate process and minimizes its window, proving that
    /// cross-process window enforcement works without touching user apps.
    /// </summary>
    private static int RunWindowProbe()
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();

        using var form = new Form
        {
            Text = "FocusGate Probe Window",
            Width = 420,
            Height = 240,
            StartPosition = FormStartPosition.CenterScreen,
            ShowInTaskbar = true,
        };

        var timer = new System.Windows.Forms.Timer { Interval = 15000 };
        timer.Tick += (_, _) =>
        {
            timer.Stop();
            form.Close();
        };
        timer.Start();

        Application.Run(form);
        return 0;
    }

    private static int RunMonitor(AgentOptions options)
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();

        BlockPolicy policy;
        try
        {
            policy = BlockPolicy.Load(options.PolicyPath);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or System.Text.Json.JsonException)
        {
            Console.Error.WriteLine($"Cannot load policy: {ex.Message}");
            Console.Error.WriteLine("A starter policy is available at apps/windows-agent/poc-policy.json");
            return 2;
        }

        SqliteEventStore store;
        try
        {
            store = new SqliteEventStore(options.DatabasePath);
            store.Initialize();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Cannot open local database: {ex.Message}");
            return 2;
        }

        using (store)
        {
            var host = new MonitorHost(options, policy, store);
            Application.Run(host);
            return host.ExitCode;
        }
    }

    private static string Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return value.Length <= max ? value : value[..max] + "…";
    }
}
