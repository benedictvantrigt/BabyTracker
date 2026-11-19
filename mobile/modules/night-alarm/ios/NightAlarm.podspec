Pod::Spec.new do |s|
  s.name           = 'NightAlarm'
  s.version        = '1.0.0'
  s.summary        = 'Night feed alarms with AlarmKit (iOS 26+)'
  s.description    = 'Schedules the night feed reminder as an AlarmKit alarm on iOS 26 and later.'
  s.author         = ''
  s.homepage       = 'https://github.com/benedictvantrigt/BabyTracker'
  s.license        = { :type => 'FSL-1.1-ALv2' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # Older iOS versions have no AlarmKit; the module reports it as unavailable there.
  s.weak_frameworks = 'AlarmKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
