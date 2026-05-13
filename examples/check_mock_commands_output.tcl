#!/usr/bin/env tclsh

set script_dir [file dirname [file normalize [info script]]]
set mock_file [file join $script_dir mock_commands.tcl]
set generated_proc_pattern {^(TC_|SetV_|Parameter_ID|Cmd_ID_)}
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
  if {[regexp $generated_proc_pattern $proc_name]} {
    lappend generated_procs $proc_name
  }
}

set failed_calls {}
set non_friendly_args {}
set payload_id_labels {}
set payload_non_id_labels {}

foreach proc_name $generated_procs {
  foreach arg [info args $proc_name] {
    if {$arg eq "args"} {
      continue
    }
    if {[regexp {^S2KCP[0-9]+$} $arg]} {
      lappend non_friendly_args [list $proc_name $arg]
    }
  }

  set call_args [required_call_args $proc_name]
  if {[catch {set payload [uplevel #0 [list $proc_name {*}$call_args]]} err]} {
    lappend failed_calls [list $proc_name $err]
    continue
  }

  foreach param_entry [lrange $payload 1 end] {
    set label [lindex $param_entry 0]
    if {$label eq "" || [string match "VARARGS:*" $label]} {
      continue
    }
    if {[regexp {^S2KCP[0-9]+$} $label]} {
      lappend payload_id_labels [list $proc_name $label]
    } else {
      lappend payload_non_id_labels [list $proc_name $label]
    }
  }
}

puts "Checked [llength $generated_procs] generated procs from $mock_file"
puts "Invocation failures: [llength $failed_calls]"
puts "Non-friendly argument names: [llength $non_friendly_args]"
puts "Payload labels using S2KCP IDs: [llength $payload_id_labels]"
puts "Payload labels not using S2KCP IDs: [llength $payload_non_id_labels]"

if {[llength $failed_calls] > 0} {
  puts "Sample invocation failures:"
  foreach failure [lrange $failed_calls 0 4] {
    puts "  [lindex $failure 0] -> [lindex $failure 1]"
  }
}

if {[llength $non_friendly_args] > 0} {
  puts "Sample non-friendly args:"
  foreach bad_arg [lrange $non_friendly_args 0 9] {
    puts "  [lindex $bad_arg 0] -> [lindex $bad_arg 1]"
  }
}

if {[llength $payload_non_id_labels] > 0} {
  puts "Sample non-ID payload labels:"
  foreach unresolved [lrange $payload_non_id_labels 0 9] {
    puts "  [lindex $unresolved 0] -> [lindex $unresolved 1]"
  }
}
