#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeDelegate.h>
#import <UIKit/UIKit.h>

#import <Expo/Expo.h>

@interface AppDelegate : EXAppDelegateWrapper <RCTBridgeDelegate>
@property (nonatomic, strong) UIWindow *window;
// Created by SceneDelegate when the first scene connects. Not `bridge`: RCTAppDelegate's
// getter for that returns its own root view factory's bridge.
@property (nonatomic, strong) RCTBridge *reactBridge;

@end
