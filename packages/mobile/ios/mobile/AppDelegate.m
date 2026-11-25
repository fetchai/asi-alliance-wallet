#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

#import <Expo/Expo.h>

#import <AppCenterReactNative.h>
#import <AppCenterReactNativeAnalytics.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // App Center init
  [AppCenterReactNative register];
  [AppCenterReactNativeAnalytics registerWithInitiallyEnabled:YES];

  // The bridge, window and root view are set up in SceneDelegate (UIScene life cycle is required from the iOS 27 SDK)
  return YES;
}

- (NSArray<id<RCTBridgeModule>> *)extraModulesForBridge:(RCTBridge *)bridge
{
  // Add any custom native modules here if needed
  return @[];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
