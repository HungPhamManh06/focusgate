using System.Text;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Monitors;
using FocusGate.Agent.Poc.Services;
using FocusGate.Agent.Poc.UI;

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
            AgentMode.Tray => RunTray(options, showDesktopWindow: false),
            AgentMode.DesktopApp => RunTray(options, showDesktopWindow: true),
            AgentMode.Status => PrintStatus(options),
            AgentMode.Register => RunRegister(options),
            AgentMode.InstallStartup => RunInstallStartup(true),
            AgentMode.UninstallStartup => RunInstallStartup(false),
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

    private static int RunTray(AgentOptions options, bool showDesktopWindow = false)
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var store = new DpapiCredentialStore();
        using var singleInstanceMutex = new Mutex(true, @"Local\FocusGate.DesktopAgent.SingleInstance", out var isFirstInstance);
        using var showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\FocusGate.DesktopAgent.ShowWindow");
        if (!isFirstInstance)
        {
            showSignal.Set();
            return 0;
        }

        var policyCache = new PolicyCacheStore();
        var usageQueue = new OfflineUsageQueue();
        var logger = new StructuredLogger();
        using var syncClient = new AgentSyncClient();
        using var context = new TrayAgentContext(options, store, policyCache, usageQueue, logger, syncClient, showDesktopWindow);

        using var stopWait = new ManualResetEventSlim(false);
        var waitHandles = new WaitHandle[] { showSignal, stopWait.WaitHandle };
        var signalThread = new Thread(() =>
        {
            while (WaitHandle.WaitAny(waitHandles) == 0)
            {
                try { context.RequestShowFromExternalSignal(); } catch { }
            }
        }) { IsBackground = true };
        signalThread.Start();

        try
        {
            Application.Run(context);
        }
        finally
        {
            stopWait.Set();
        }
        return 0;
    }

    private static int PrintStatus(AgentOptions options)
    {
        var store = new DpapiCredentialStore();
        var logger = new StructuredLogger();
        var credentials = store.Load();
        if (credentials is null)
        {
            Console.WriteLine("Status: Unregistered");
            Console.WriteLine($"Target API: {options.ApiBaseUrl}");
            Console.WriteLine($"Credentials file: {store.FilePath} (not present)");
            Console.WriteLine($"Logs directory: {logger.LogDirectory}");
            return 0;
        }

        Console.WriteLine("Status: Registered");
        Console.WriteLine($"Device: {credentials.DeviceName} ({credentials.DeviceId})");
        Console.WriteLine($"API: {credentials.ApiBaseUrl}");
        Console.WriteLine($"Registered at (UTC): {credentials.RegisteredAtUtc:O}");
        Console.WriteLine($"Logs directory: {logger.LogDirectory}");
        return 0;
    }

    private static int RunRegister(AgentOptions options)
    {
        var store = new DpapiCredentialStore();
        var policyCache = new PolicyCacheStore();
        var logger = new StructuredLogger();
        using var syncClient = new AgentSyncClient();

        var deviceName = string.IsNullOrWhiteSpace(options.DeviceName)
            ? Environment.MachineName
            : options.DeviceName.Trim();

        try
        {
            string token;
            string? refreshToken = null;
            if (!string.IsNullOrWhiteSpace(options.AccessToken))
            {
                token = options.AccessToken;
            }
            else if (!string.IsNullOrWhiteSpace(options.Email) && !string.IsNullOrWhiteSpace(options.Password))
            {
                var auth = syncClient
                    .SignInWithPasswordAsync(
                        "https://dyfdeceiszmxozdqugon.supabase.co",
                        "sb_publishable_TPpxronGIazapp2ylFORIw_ejce1q9C",
                        options.Email.Trim(),
                        options.Password)
                    .GetAwaiter()
                    .GetResult();
                token = auth.AccessToken;
                refreshToken = auth.RefreshToken;
            }
            else
            {
                token = "local-dev-token";
            }

            var reg = syncClient
                .RegisterDeviceAsync(options.ApiBaseUrl, token, deviceName, "0.1.0")
                .GetAwaiter()
                .GetResult();

            var creds = new AgentCredentials(
                ApiBaseUrl: options.ApiBaseUrl,
                DeviceId: reg.DeviceId,
                DeviceName: reg.Name,
                AccessToken: token,
                RefreshToken: refreshToken,
                RegisteredAtUtc: DateTimeOffset.UtcNow);
            store.Save(creds);

            var policy = syncClient
                .PullPolicyAsync(options.ApiBaseUrl, token, reg.DeviceId)
                .GetAwaiter()
                .GetResult();
            policyCache.Save(policy);

            logger.Info("agent.registered", "Registered Windows device and pulled initial policy.", new Dictionary<string, object?>
            {
                ["deviceId"] = reg.DeviceId,
                ["deviceName"] = reg.Name,
                ["lockActive"] = policy.LockActive,
            });

        Console.WriteLine($"Registered device '{reg.Name}' ({reg.DeviceId})");
            Console.WriteLine($"Policy: {(policy.LockActive ? "Lock Active" : "Unlocked")} ({policy.BlockedProcesses.Count} blocked rules)");
            return 0;
        }
        catch (Exception ex)
        {
            logger.Error("agent.register_failed", "Device registration failed.", new Dictionary<string, object?>
            {
                ["error"] = ex.Message,
            });
            Console.Error.WriteLine($"Registration failed: {ex.Message}");
            return 1;
        }
    }

    private static int RunInstallStartup(bool install)
    {
        if (install)
        {
            StartupRegistrar.Install();
            Console.WriteLine("Installed FocusGate Agent auto-start on Windows sign-in.");
        }
        else
        {
            StartupRegistrar.Uninstall();
            Console.WriteLine("Removed FocusGate Agent auto-start.");
        }
        return 0;
    }

    private static string Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return value.Length <= max ? value : value[..max] + "…";
    }
}
