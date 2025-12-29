# Add project specific ProGuard rules here.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep common Android classes
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Application
