import net.dongliu.apk.parser.ApkFile;
import net.dongliu.apk.parser.bean.ApkMeta;

import java.io.File;
import java.util.Locale;

/**
 * Reads the finished APK back with an unrelated third-party parser.
 *
 * The binary manifest and the resource table in this project are written by
 * encoders in android/tools, and verify.py decodes them with matching code.
 * A misunderstanding shared between an encoder and its own decoder would slip
 * through both, so the package is also parsed by an implementation that has
 * nothing in common with either.
 */
public class ApkCheck {
    public static void main(String[] args) throws Exception {
        ApkFile apk = new ApkFile(new File(args[0]));
        apk.setPreferredLocale(Locale.ENGLISH);
        ApkMeta m = apk.getApkMeta();
        System.out.println("package    : " + m.getPackageName());
        System.out.println("label      : " + m.getLabel());
        System.out.println("version    : " + m.getVersionName() + " (code " + m.getVersionCode() + ")");
        System.out.println("sdk        : min " + m.getMinSdkVersion() + ", target " + m.getTargetSdkVersion());
        System.out.println("icon       : " + m.getIcon());
        System.out.println("permissions: " + m.getUsesPermissions());

        String xml = apk.getManifestXml();
        boolean launchable = xml.contains("android.intent.category.LAUNCHER")
                && xml.contains("android.intent.action.MAIN")
                && xml.contains("com.regenstudio.regen.MainActivity");
        boolean iconOk = m.getIcon() != null && m.getIcon().contains("ic_launcher");
        System.out.println("launchable : " + launchable);
        apk.close();

        if (!launchable) {
            System.out.println("FAILED: no launchable activity in the manifest");
            System.exit(1);
        }
        if (!iconOk) {
            System.out.println("FAILED: android:icon does not resolve through resources.arsc");
            System.exit(1);
        }
    }
}
