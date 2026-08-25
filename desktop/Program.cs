using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FloorIsLava.Desktop;

public class MainForm : Form
{
    private readonly WebView2 _webView = new();

    public MainForm()
    {
        Text = "Floor Is Lava";
        WindowState = FormWindowState.Maximized;
        _webView.Dock = DockStyle.Fill;
        Controls.Add(_webView);
        Load += OnLoad;
    }

    private async void OnLoad(object? sender, EventArgs e)
    {
        await _webView.EnsureCoreWebView2Async();
        string baseDir = AppContext.BaseDirectory;
        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.local", baseDir, CoreWebView2HostResourceAccessKind.Allow);
        _webView.CoreWebView2.Navigate("https://app.local/index.html");
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
