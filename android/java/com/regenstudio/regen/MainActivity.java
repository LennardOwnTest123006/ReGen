package com.regenstudio.regen;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * ReGen on Android.
 *
 * The game itself is the same static build that ships on Windows and the web;
 * this activity is only a full-screen, hardware-accelerated WebView host that
 * keeps the system UI out of the way and hands back-presses to the game.
 *
 * Written without lambdas or other Java 8+ language features so it can be
 * compiled straight to dex without desugaring.
 */
public class MainActivity extends Activity {

    private WebView web;
    private boolean loaded = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Landscape, no title bar, no action bar, drawn edge to edge.
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Throwable t) {
            // some devices refuse orientation locks; the game still plays
        }
        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
        } catch (Throwable t) {
            // themes with an action bar reject this; hidden below instead
        }
        try {
            if (getActionBar() != null) {
                getActionBar().hide();
            }
        } catch (Throwable t) {
            // no action bar to hide
        }

        Window window = getWindow();
        window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        if (Build.VERSION.SDK_INT >= 21) {
            window.setStatusBarColor(Color.BLACK);
            window.setNavigationBarColor(Color.BLACK);
        }
        // Let the canvas run under the cutout on notched phones.
        if (Build.VERSION.SDK_INT >= 28) {
            try {
                window.getAttributes().layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            } catch (Throwable t) {
                // older or unusual ROMs: ignore
            }
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF070A14);

        web = new WebView(this);
        web.setBackgroundColor(0xFF070A14);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= 17) {
            s.setMediaPlaybackRequiresUserGesture(false);
        }
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= 26) {
            s.setSafeBrowsingEnabled(false);
        }
        // The game is entirely local; block any attempt to leave it.
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return true;
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loaded = true;
                applyImmersive();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                return true;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        web.loadUrl("file:///android_asset/game/index.html");
        applyImmersive();
    }

    /** Sticky immersive: the bars come back on a swipe and hide themselves again. */
    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        try {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } catch (Throwable t) {
            // pre-KitKat flags are a no-op; nothing to recover from
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersive();
        }
    }

    /** Back closes the open menu first, and only leaves from the title screen. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && loaded && web != null) {
            web.evaluateJavascript(
                    "(function(){try{"
                            + "if(!window.RG||!RG.UI)return 'exit';"
                            + "if(RG.UI.dialogOpen()){RG.UI.closeDialog();return 'handled';}"
                            + "if(RG.UI.isOpen()){RG.UI.back();return 'handled';}"
                            + "if(RG.game&&RG.game.state==='play'){RG.game.pause();return 'handled';}"
                            + "return 'exit';"
                            + "}catch(e){return 'exit';}})()",
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if (value != null && value.indexOf("exit") >= 0) {
                                finish();
                            }
                        }
                    });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            web.onPause();
            web.pauseTimers();
            web.evaluateJavascript(
                    "(function(){try{if(window.RG&&RG.Save&&RG.game)RG.Save.flush(RG.game.save);"
                            + "if(window.RG&&RG.Audio)RG.Audio.suspend();}catch(e){}})()", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            web.evaluateJavascript(
                    "(function(){try{if(window.RG&&RG.Audio)RG.Audio.resume();}catch(e){}})()", null);
        }
        applyImmersive();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
