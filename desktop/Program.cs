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
        try
        {
            await _webView.EnsureCoreWebView2Async();
            _webView.CoreWebView2.NewWindowRequested += (s, a) =>
            {
                a.Handled = true;
                try
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo { FileName = a.Uri, UseShellExecute = true });
                }
                catch { }
            };

            var asm = typeof(MainForm).Assembly;
            string ReadRes(string suffix)
            {
                string found = null;
                foreach (var n in asm.GetManifestResourceNames())
                {
                    if (n.EndsWith(suffix)) { found = n; break; }
                }
                if (found == null) throw new System.Exception("Resource not found: " + suffix);
                using var stream = asm.GetManifestResourceStream(found);
                using var reader = new System.IO.StreamReader(stream);
                return reader.ReadToEnd();
            }

            string html = ReadRes("index.html");
            string css = ReadRes("styles.css");
            string js = ReadRes("game.js");
            html = html.Replace("<link rel=\"stylesheet\" href=\"./styles.css\">", "<style>" + css + "</style>");
            html = html.Replace("<script src=\"./game.js\"></script>", "<script>" + js + "</script>");

            _webView.CoreWebView2.NavigateToString(html);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Не удалось запустить игру (WebView2).\nВозможно, на этом компьютере не установлен Microsoft Edge WebView2 Runtime.\n\nСкачайте и установите его:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703\n\nОшибка: " + ex.Message,
                "Floor Is Lava", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}
