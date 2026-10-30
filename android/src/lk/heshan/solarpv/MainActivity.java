package lk.heshan.solarpv;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.Manifest;
import android.util.Base64;
import android.webkit.*;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.IOException;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.HashMap;
import java.util.Map;

/** Hosts only packaged app files at a secure virtual origin. External links open in the browser. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private WebView view;
    private ValueCallback<Uri[]> fileCallback;
    private static final int PICK_FILE = 101, SAVE_FILE = 102, CAMERA_REQUEST = 103, LOCATION_REQUEST = 104;
    private PermissionRequest pendingCamera;
    private GeolocationPermissions.Callback pendingLocation;
    private String pendingLocationOrigin;
    private byte[] pendingWorkbook;

    public final class InventoryBridge {
        @JavascriptInterface public void saveWorkbook(String filename, String encoded) {
            saveFile(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", encoded);
        }
        @JavascriptInterface public void saveFile(String filename, String mime, String encoded) {
            final String safeMime;
            if ("application/pdf".equals(mime) || "application/json".equals(mime) || "text/html".equals(mime) || "text/csv".equals(mime) || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mime)) safeMime=mime;
            else { runOnUiThread(new Runnable(){public void run(){Toast.makeText(MainActivity.this, "Unsupported export type.", Toast.LENGTH_LONG).show();}}); return; }
            if (filename == null) return;
            if (encoded == null || encoded.length() > 28000000) { runOnUiThread(new Runnable(){public void run(){Toast.makeText(MainActivity.this, "Export is too large.", Toast.LENGTH_LONG).show();}}); return; }
            try {
                final byte[] bytes=Base64.decode(encoded, Base64.DEFAULT);
                final String safeFilename=filename;
                runOnUiThread(new Runnable(){public void run(){
                    if (pendingWorkbook != null) { Toast.makeText(MainActivity.this, "Finish the current save first.", Toast.LENGTH_LONG).show(); return; }
                    pendingWorkbook=bytes;
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(safeMime);
                    intent.putExtra(Intent.EXTRA_TITLE, safeFilename.replaceAll("[^A-Za-z0-9._-]", "_"));
                    try { startActivityForResult(intent, SAVE_FILE); } catch(Exception e) { pendingWorkbook=null; Toast.makeText(MainActivity.this, "No app can save this file.", Toast.LENGTH_LONG).show(); }
                }});
            } catch(IllegalArgumentException e) { runOnUiThread(new Runnable(){public void run(){Toast.makeText(MainActivity.this, "Unable to prepare file.", Toast.LENGTH_LONG).show();}}); }
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xff142b36);
        getWindow().setNavigationBarColor(0xff142b36);
        view = new WebView(this);
        setContentView(view, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " SolarPVFieldTool/1.0 (+https://heshanthar-boop.github.io/solar-pv/)");
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.addJavascriptInterface(new InventoryBridge(), "AndroidInventory");
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
                if (path != null && path.startsWith("/pvgis/")) { if(request.isForMainFrame()) return notFound(); return pvgisProxy(uri, request.getMethod()); }
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
            @Override public void onPermissionRequest(final PermissionRequest request) {
                Uri origin=request.getOrigin();
                boolean video=false; for(String resource:request.getResources()) if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) video=true;
                if(!"https".equals(origin.getScheme()) || !ORIGIN.equals(origin.getHost()) || !video){request.deny();return;}
                runOnUiThread(new Runnable(){public void run(){if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else{pendingCamera=request;if(pendingLocation==null)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_REQUEST);}}});
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if(pendingCamera==request)pendingCamera=null; }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                Uri uri=Uri.parse(origin);
                if(!"https".equals(uri.getScheme())||!ORIGIN.equals(uri.getHost())){callback.invoke(origin,false,false);return;}
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){callback.invoke(origin,true,false);return;}
                pendingLocation=callback;pendingLocationOrigin=origin;
                if(pendingCamera==null)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQUEST);
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
                catch (Exception e) { fileCallback = null; callback.onReceiveValue(null); return false; }
            }
        });
        view.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                if (url.startsWith("https://") || url.startsWith("http://")) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                else Toast.makeText(MainActivity.this, "This export is available from the website in your browser.", Toast.LENGTH_LONG).show();
            }
        });
        if (state == null) view.loadUrl("https://" + ORIGIN + "/assets/index.html");
        else view.restoreState(state);
    }
    /** GET-only proxy to the official PVGIS API. Allows on-device model access
     * without exposing a general network proxy or disabling TLS/CORS. */
    private static WebResourceResponse pvgisProxy(Uri uri, String method) {
        String path=uri.getPath(), name=path.substring("/pvgis/".length());
        if (!"GET".equals(method) || !(name.equals("tmy") || name.equals("seriescalc") || name.equals("printhorizon"))) return notFound();
        String query=uri.getEncodedQuery();
        if(query == null || query.length()>4096 || query.contains("\r") || query.contains("\n") || !"json".equals(uri.getQueryParameter("outputformat"))) return notFound();
        HttpURLConnection connection=null;
        try {
            URL target=new URL("https://re.jrc.ec.europa.eu/api/v5_3/"+name+"?"+query);
            connection=(HttpURLConnection)target.openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(20000); connection.setReadTimeout(60000);
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            int status=connection.getResponseCode();
            InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();
            if(input==null) throw new IOException("No response body");
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n,total=0;
            try(InputStream source=input){while((n=source.read(buffer))!=-1){total+=n;if(total>20000000)throw new IOException("PVGIS response too large");out.write(buffer,0,n);}}
            if(status<200 || status>599 || (status>=300 && status<400)) status=502;
            String reason=status>=400?"PVGIS request failed":"OK";
            Map<String,String> headers=new HashMap<>();headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","default-src 'none'");
            return new WebResourceResponse("application/json","UTF-8",status,reason,headers,new ByteArrayInputStream(out.toByteArray()));
        } catch(Exception e) {
            return new WebResourceResponse("text/plain","UTF-8",502,"PVGIS unavailable",null,new ByteArrayInputStream("PVGIS could not be reached".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } finally { if(connection!=null)connection.disconnect(); }
    }
    private static WebResourceResponse notFound() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new java.io.ByteArrayInputStream(new byte[0])); }
    private static boolean textual(String path) { return path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".json") || path.endsWith(".svg"); }
    private static String mime(String path) {
        String p=path.toLowerCase(Locale.ROOT);
        if(p.endsWith(".html"))return "text/html"; if(p.endsWith(".js")||p.endsWith(".mjs"))return "application/javascript"; if(p.endsWith(".wasm"))return "application/wasm";
        if(p.endsWith(".css"))return "text/css"; if(p.endsWith(".json"))return "application/json";
        if(p.endsWith(".svg"))return "image/svg+xml"; if(p.endsWith(".png"))return "image/png";
        if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg"; if(p.endsWith(".woff2"))return "font/woff2";
        return "application/octet-stream";
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        if(request==PICK_FILE && fileCallback!=null){fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));fileCallback=null;}
        if(request==SAVE_FILE && pendingWorkbook!=null){
            if(result==RESULT_OK && data!=null && data.getData()!=null){
                try(OutputStream stream=getContentResolver().openOutputStream(data.getData())){if(stream==null)throw new IOException("No output stream");stream.write(pendingWorkbook);Toast.makeText(this,"File saved.",Toast.LENGTH_LONG).show();}
                catch(IOException e){Toast.makeText(this,"Could not save the file. Please try again.",Toast.LENGTH_LONG).show();}
            }
            pendingWorkbook=null;
        }
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if(request==CAMERA_REQUEST && pendingCamera!=null){if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)pendingCamera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else pendingCamera.deny();pendingCamera=null;if(pendingLocation!=null)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},LOCATION_REQUEST);}
        if(request==LOCATION_REQUEST && pendingLocation!=null){boolean granted=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;pendingLocation.invoke(pendingLocationOrigin,granted,false);pendingLocation=null;pendingLocationOrigin=null;if(pendingCamera!=null)requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA_REQUEST);}
    }
    @Override protected void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); view.saveState(state); }
    @Override public void onBackPressed() { if(view.canGoBack())view.goBack();else super.onBackPressed(); }
}
