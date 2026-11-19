Pod::Spec.new do |s|
  s.name           = 'ReminderKey'
  s.version        = '1.0.0'
  s.summary        = 'Shares the reminder key with the notification service extension'
  s.description    = 'Keeps the family key in the App Group keychain so pushed reminders can be decrypted (#6).'
  s.author         = ''
  s.homepage       = 'https://github.com/benedictvantrigt/BabyTracker'
  s.license        = { :type => 'FSL-1.1-ALv2' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
