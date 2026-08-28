using System;
using Microsoft.Maui.Controls;

namespace FloorIsLava.Maui;

public partial class MainPage : ContentPage
{
	private bool _loaded;

	public MainPage()
	{
		InitializeComponent();
		webView.HandlerChanged += OnWebViewHandlerChanged;
	}

	private void OnWebViewHandlerChanged(object? sender, EventArgs e)
	{
		if (_loaded)
			return;

#if ANDROID
		try
		{
			if (webView.Handler?.PlatformView is Android.Webkit.WebView androidView)
			{
				var settings = androidView.Settings;
				if (settings is not null)
				{
					settings.JavaScriptEnabled = true;
					settings.DomStorageEnabled = true;
				}
			}

			_loaded = true;
			webView.Source = new UrlWebViewSource
			{
				Url = "file:///android_asset/Resources/Raw/wwwroot/index.html"
			};
		}
		catch (Exception ex)
		{
			ShowError(ex);
		}
#else
		_loaded = true;
		webView.Source = new UrlWebViewSource { Url = "wwwroot/index.html" };
#endif
	}

	private void ShowError(Exception ex)
	{
		MainThread.BeginInvokeOnMainThread(async () =>
		{
			try { await DisplayAlertAsync("Launch error", ex.ToString(), "OK"); } catch { }
		});
	}
}
