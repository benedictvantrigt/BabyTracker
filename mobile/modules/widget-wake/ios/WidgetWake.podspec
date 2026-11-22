Pod::Spec.new do |s|
  s.name           = 'WidgetWake'
  s.version        = '1.0.0'
  s.summary        = 'Background time for home-screen widget taps'
  s.description    = 'Keeps the app awake while its JavaScript carries out a widget tap.'
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
