# Switches the generated iOS project to manual signing with our App Store profiles and writes
# the ExportOptions.plist for xcodebuild -exportArchive (README, App Store).
# Usage: ruby ios-manual-signing.rb <ios dir> <team id> <profiles.txt> <ExportOptions.plist>
# profiles.txt has one "bundle.id=profile-uuid" line per installed profile.
# Uses the xcodeproj gem, which comes with CocoaPods.
require 'xcodeproj'

ios_dir, team_id, profiles_file, export_options = ARGV
abort 'usage: ios-manual-signing.rb <ios dir> <team id> <profiles.txt> <ExportOptions.plist>' unless export_options

profiles = File.readlines(profiles_file, chomp: true).reject(&:empty?).to_h { |l| l.split('=', 2) }
project_path = Dir.glob(File.join(ios_dir, '*.xcodeproj')).reject { |p| p.end_with?('Pods.xcodeproj') }.first
abort "no Xcode project in #{ios_dir}" unless project_path
project = Xcodeproj::Project.open(project_path)

used = {}
project.native_targets.each do |target|
  next unless %i[application app_extension].include?(target.symbol_type)

  target.build_configurations.each do |config|
    s = config.build_settings
    bundle_id = s['PRODUCT_BUNDLE_IDENTIFIER']
    uuid = profiles[bundle_id]
    abort "no provisioning profile for #{target.name} (#{bundle_id}); have: #{profiles.keys.join(', ')}" unless uuid

    s['CODE_SIGN_STYLE'] = 'Manual'
    s['DEVELOPMENT_TEAM'] = team_id
    s['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
    s['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
    s['PROVISIONING_PROFILE_SPECIFIER'] = uuid
    used[bundle_id] = uuid
  end
  puts "#{target.name}: #{target.build_configurations.map { |c| c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] }.uniq.join(', ')}"
end

# Target-level attributes override build settings in Xcode's UI and some xcodebuild paths.
attributes = project.root_object.attributes['TargetAttributes'] || {}
attributes.each_value do |a|
  a['ProvisioningStyle'] = 'Manual'
  a['DevelopmentTeam'] = team_id
end
project.save

entries = used.map { |id, uuid| "\t\t<key>#{id}</key>\n\t\t<string>#{uuid}</string>" }.join("\n")
File.write(export_options, <<~PLIST)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
  \t<key>method</key>
  \t<string>app-store-connect</string>
  \t<key>destination</key>
  \t<string>export</string>
  \t<key>teamID</key>
  \t<string>#{team_id}</string>
  \t<key>signingStyle</key>
  \t<string>manual</string>
  \t<key>signingCertificate</key>
  \t<string>Apple Distribution</string>
  \t<key>provisioningProfiles</key>
  \t<dict>
  #{entries}
  \t</dict>
  \t<key>uploadSymbols</key>
  \t<true/>
  </dict>
  </plist>
PLIST
puts "Signing #{used.size} bundle(s) manually for team #{team_id}"
