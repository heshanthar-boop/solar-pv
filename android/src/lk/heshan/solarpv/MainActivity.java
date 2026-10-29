package lk.heshan.solarpv;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.IOException;
import java.util.Locale;

/** Hosts only packaged app files at a secure virtual origin. External links open in the browser. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private WebView view;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 101;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff142b36);
        getWindow().setNavigationBarColor(0xff142b36);
        view = new WebView(this);
        setContentView(view, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                if (url.startsWith("https://" + ORIGIN + "/assets/")) {
                    // Open source links in the phone browser, including dynamically created links.
                    v.evaluateJavascript("document.addEventListener('click',function(e){var a=e.target.closest('a[target=_blank]');if(a)a.target='_self';},true)", null);
                }
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!ORIGIN.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || !path.startsWith("/assets/") || path.contains("..")) return notFound();
                String name = path.substring(8);
                try { return new WebResourceResponse(mime(name), textual(name) ? "UTF-8" : null, getAssets().open("web/" + name)); }
                catch (IOException e) { return notFound(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if ("https".equals(uri.getScheme()) && ORIGIN.equals(uri.getHost())) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
                catch (Exception e) { fileCallback = null; callback.onReceiveValue(null); return false; }
            }
        });
        view.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("https://") || url.startsWith("http://")) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            else Toast.makeText(this, "This export is available from the website in your browser.", Toast.LENGTH_LONG).show();
        });
        if (state == null) view.loadUrl("https://" + ORIGIN + "/assets/index.html");
        else view.restoreState(state);
    }
    private static WebResourceResponse notFound() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new java.io.ByteArrayInputStream(new byte[0])); }
    private static boolean textual(String path) { return path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".json") || path.endsWith(".svg"); }
    private static String mime(String path) {
        String p=path.toLowerCase(Locale.ROOT);
        if(p.endsWith(".html"))return "text/html"; if(p.endsWith(".js"))return "application/javascript";
        if(p.endsWith(".css"))return "text/css"; if(p.endsWith(".json"))return "application/json";
        if(p.endsWith(".svg"))return "image/svg+xml"; if(p.endsWith(".png"))return "image/png";
        if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg"; if(p.endsWith(".woff2"))return "font/woff2";
        return "application/octet-stream";
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE && fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}
    }
    @Override protected void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); view.saveState(state); }
    @Override public void onBackPressed() { if(view.canGoBack())view.goBack();else super.onBackPressed(); }
}
