#!/usr/bin/env tclsh

set script_dir [file dirname [file normalize [info script]]]
set mock_file [file join $script_dir mock_commands.tcl]
if {[llength $argv] >= 1} {
  set mock_file [lindex $argv 0]
}
set mock_file [file normalize $mock_file]

if {![file exists $mock_file]} {
  error "Mock command file not found: $mock_file"
}

source $mock_file

proc required_call_args {proc_name} {
  set args {}
  foreach arg [info args $proc_name] {
    if {$arg eq "args"} {
      continue
    }
    if {[info default $proc_name $arg _default]} {
      continue
    }
    lappend args "${arg}_VALUE"
  }
  return $args
}

set all_procs [lsort [info procs]]
set generated_procs {}
foreach proc_name $all_procs {
  if {[regexp {^(TC_|SetV_|Parameter_ID|Cmd_ID_)} $proc_name]} {
    lappend generated_procs $proc_name
  }
}

set failed_calls {}
set unresolved_labels {}

foreach proc_name $generated_procs {
  set call_args [required_call_args $proc_name]
  if {[catch {set payload [uplevel #0 [list $proc_name {*}$call_args]]} err]} {
    lappend failed_calls [list $proc_name $err]
    continue
  }

  foreach param_entry [lrange $payload 1 end] {
    set label [lindex $param_entry 0]
    if {[regexp {^S2KCP[0-9]+$} $label]} {
      lappend unresolved_labels [list $proc_name $label]
    }
  }
}

puts "Checked [llength $generated_procs] generated procs from $mock_file"
puts "Invocation failures: [llength $failed_calls]"
puts "Unresolved S2KCP labels: [llength $unresolved_labels]"

if {[llength $failed_calls] > 0} {
  puts "Sample invocation failures:"
  foreach failure [lrange $failed_calls 0 4] {
    puts "  [lindex $failure 0] -> [lindex $failure 1]"
  }
}

if {[llength $unresolved_labels] > 0} {
  puts "Sample unresolved labels:"
  foreach unresolved [lrange $unresolved_labels 0 9] {
    puts "  [lindex $unresolved 0] -> [lindex $unresolved 1]"
  }
}
