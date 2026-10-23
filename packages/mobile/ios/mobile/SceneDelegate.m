#import "SceneDelegate.h"
#import "AppDelegate.h"

#import <React/RCTBridge.h>
#import <React/RCTRootView.h>
#import <React/RCTConvert.h>
#import <React/RCTLinkingManager.h>

@implementation SceneDelegate

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;

  // Scenes don't get launchOptions, so hand a cold-start deep link to the bridge for Linking.getInitialURL()
  if (appDelegate.reactBridge == nil) {
    NSMutableDictionary *launchOptions = [NSMutableDictionary dictionary];
    NSURL *url = connectionOptions.URLContexts.anyObject.URL;
    if (url != nil) {
      launchOptions[UIApplicationLaunchOptionsURLKey] = url;
    }
    appDelegate.reactBridge = [[RCTBridge alloc] initWithDelegate:appDelegate launchOptions:launchOptions];
  }

  // Create the root view
  RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:appDelegate.reactBridge
                                                   moduleName:@"mobile"
                                            initialProperties:nil];

  // Set background color from Info.plist (or fallback to white)
  id rootViewBackgroundColor = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RCTRootViewBackgroundColor"];
  if (rootViewBackgroundColor != nil) {
    rootView.backgroundColor = [RCTConvert UIColor:rootViewBackgroundColor];
  } else {
    rootView.backgroundColor = [UIColor whiteColor];
  }

  // Set up the window and root view controller
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIViewController *rootViewController = [UIViewController new];
  rootViewController.view = rootView;
  self.window.rootViewController = rootViewController;
  // Libraries still look up the window through the app delegate
  appDelegate.window = self.window;
  [self.window makeKeyAndVisible];

  // Optional: custom splash screen loading from storyboard
  UIStoryboard *sb = [UIStoryboard storyboardWithName:@"SplashScreen" bundle:nil];
  UIViewController *vc = [sb instantiateInitialViewController];
  if (vc) {
    rootView.loadingView = vc.view;
  }
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:@{}];
  }
}

@end
