export function locationPermissionHelp(userAgent: string, standalone: boolean, touchPoints = 0) {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  if (ios) {
    const chrome = /CriOS/i.test(userAgent) && !standalone;
    return {
      device: standalone ? 'iPhone / iPad app' : chrome ? 'Chrome on iPhone / iPad' : 'Safari on iPhone / iPad',
      steps: [
        'Open Settings > Privacy & Security > Location Services and turn on Location Services.',
        `Select ${chrome ? 'Chrome' : 'Safari Websites'} and allow location while using it. If Powerwashing Pros is listed separately, allow it too.`,
        ...(chrome ? [] : ['Open this website in Safari. In the page menu, open Website Settings and set Location to Allow.']),
        'Return to the map and tap Try again. Allow access if your phone asks.',
      ],
      helpUrl: 'https://support.apple.com/en-us/102515',
    };
  }
  if (/Android/i.test(userAgent)) return {
    device: 'Android',
    steps: [
      'Open this website in your browser. Tap the site-information icon beside the address, then Permissions > Location > Allow.',
      'In Chrome you can also use the three-dot menu > Settings > Site settings > Location and allow this website.',
      'If your phone still blocks location, open Android Settings > Apps > your browser > Permissions > Location and allow it while using the app. Make sure device Location is on.',
      'Return to the map and tap Try again.',
    ],
    helpUrl: 'https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DAndroid&hl=en',
  };
  const safari = /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg|OPR/i.test(userAgent);
  return {
    device: safari ? 'Safari on Mac' : 'Desktop browser',
    steps: [
      safari ? 'Open Safari > Settings > Websites > Location and allow this website.' : 'Click the site-information icon beside the address. Open this website\'s permissions and set Location to Allow.',
      'If location is blocked by your computer, allow your browser in the system privacy and location settings.',
      'Return to the map and tap Try again. Reload this page if your browser requires it.',
    ],
    helpUrl: safari ? 'https://support.apple.com/guide/safari/change-websites-settings-ibrwe2159f50/mac' : 'https://support.google.com/chrome/answer/142065?hl=en',
  };
}
