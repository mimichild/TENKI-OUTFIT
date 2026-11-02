Pod::Spec.new do |s|
  s.name           = 'TenkiBgRemoval'
  s.version        = '1.0.0'
  s.summary        = 'On-device background removal for TENKI OUTFIT'
  s.description    = 'Wraps Vision VNGenerateForegroundInstanceMaskRequest (iOS 17+).'
  s.author         = 'TENKI OUTFIT'
  s.homepage       = 'https://github.com/mimichild/tenki-outfit'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
