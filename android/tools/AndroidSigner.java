import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Signs an APK with APK Signature Scheme v1 (JAR) and v2, using Google's own
 * apksig library, then verifies the result and prints what it found.
 *
 * Usage: AndroidSigner <keystore> <storePass> <alias> <keyPass> <in.apk> <out.apk>
 */
public class AndroidSigner {

    public static void main(String[] args) throws Exception {
        if (args.length < 6) {
            System.err.println("usage: AndroidSigner <keystore> <storePass> <alias> <keyPass> <in> <out> [v1v2|v2]");
            System.exit(2);
        }
        boolean v1 = args.length < 7 || "v1v2".equals(args[6]);
        File keystoreFile = new File(args[0]);
        char[] storePass = args[1].toCharArray();
        String alias = args[2];
        char[] keyPass = args[3].toCharArray();
        File in = new File(args[4]);
        File out = new File(args[5]);

        KeyStore ks = KeyStore.getInstance("PKCS12");
        FileInputStream fis = new FileInputStream(keystoreFile);
        try {
            ks.load(fis, storePass);
        } finally {
            fis.close();
        }

        PrivateKey key = (PrivateKey) ks.getKey(alias, keyPass);
        if (key == null) {
            throw new IllegalStateException("no private key for alias " + alias);
        }
        java.security.cert.Certificate[] chain = ks.getCertificateChain(alias);
        List<X509Certificate> certs = new ArrayList<X509Certificate>();
        for (int i = 0; i < chain.length; i++) {
            certs.add((X509Certificate) chain[i]);
        }

        ApkSigner.SignerConfig signer =
                new ApkSigner.SignerConfig.Builder("ReGen", key, certs).build();

        ApkSigner.Builder builder = new ApkSigner.Builder(Collections.singletonList(signer));
        builder.setInputApk(in);
        builder.setOutputApk(out);
        builder.setV1SigningEnabled(v1);
        builder.setV2SigningEnabled(true);
        builder.setOtherSignersSignaturesPreserved(false);
        // Without a v1 signature the package needs API 24 or newer, so tell
        // apksig that explicitly rather than letting it refuse.
        if (!v1) {
            builder.setMinSdkVersion(24);
        }
        // Otherwise minSdkVersion is read out of the binary manifest we
        // generated, which doubles as a check that it really is valid
        // binary XML.
        builder.build().sign();

        ApkVerifier.Result result = new ApkVerifier.Builder(out).build().verify();
        System.out.println("v1 signed: " + result.isVerifiedUsingV1Scheme());
        System.out.println("v2 signed: " + result.isVerifiedUsingV2Scheme());
        System.out.println("verified:  " + result.isVerified());
        for (ApkVerifier.IssueWithParams e : result.getErrors()) {
            System.out.println("ERROR: " + e);
        }
        int warned = 0;
        for (ApkVerifier.IssueWithParams w : result.getWarnings()) {
            if (warned++ < 8) System.out.println("warn: " + w);
        }
        if (!result.isVerified()) {
            System.exit(1);
        }
    }
}
