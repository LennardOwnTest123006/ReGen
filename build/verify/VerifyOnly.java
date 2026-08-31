import com.android.apksig.ApkVerifier;
import java.io.File;
public class VerifyOnly {
    public static void main(String[] a) throws Exception {
        ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[0])).build().verify();
        System.out.println("v1 " + r.isVerifiedUsingV1Scheme() + " | v2 " + r.isVerifiedUsingV2Scheme() + " | verified " + r.isVerified());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
        if (!r.isVerified()) System.exit(1);
    }
}
