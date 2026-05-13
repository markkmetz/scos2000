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

proc payload_value {payload label} {
  foreach param_entry [lrange $payload 1 end] {
    if {[lindex $param_entry 0] eq $label} {
      return [lindex $param_entry 1]
    }
  }
  return "__MISSING__"
}

set all_procs [lsort [info procs]]
set generated_procs {}
foreach proc_name $all_procs {
  set body [info body $proc_name]
  if {[string first "# S2KTC" $body] >= 0} {
    lappend generated_procs $proc_name
  }
}

set failed_calls {}
set non_friendly_args {}
set payload_id_labels {}
set payload_non_id_labels {}
set auto_count_failures {}

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
  if {[catch {set payload [{*}[list $proc_name {*}$call_args]]} err]} {
    lappend failed_calls [list $proc_name $err]
    continue
  }

  foreach param_entry [lrange $payload 1 end] {
    set label [lindex $param_entry 0]
    if {$label eq "" || [string match "VARARGS:*" $label]} {
      continue
    }
    if {[regexp {^S2K[A-Z0-9]+$} $label]} {
      lappend payload_id_labels [list $proc_name $label]
    } else {
      lappend payload_non_id_labels [list $proc_name $label]
    }
  }
}

if {[llength [info procs TC_6_1]] > 0} {
  set sample_words [list AA BB]
  set expected_count [llength $sample_words]
  if {[catch {set payload [TC_6_1 1 4096 0 "" $sample_words]} err]} {
    lappend auto_count_failures [list TC_6_1 $err]
  } else {
    set count_value [payload_value $payload S2KCP031]
    set words_value [payload_value $payload S2KCP032]
    if {$count_value ne $expected_count || [llength $words_value] != $expected_count} {
      lappend auto_count_failures [list TC_6_1 "Expected S2KCP031=$expected_count and $expected_count words, got S2KCP031=$count_value words=$words_value"]
    }
  }
}

if {[llength [info procs TC_6_2]] > 0} {
  set sample_words [list 10 20 30]
  set expected_count [llength $sample_words]
  if {[catch {set payload [TC_6_2 1 8192 "" $sample_words]} err]} {
    lappend auto_count_failures [list TC_6_2 $err]
  } else {
    set count_value [payload_value $payload S2KCP031]
    set words_value [payload_value $payload S2KCP032]
    if {$count_value ne $expected_count || [llength $words_value] != $expected_count} {
      lappend auto_count_failures [list TC_6_2 "Expected S2KCP031=$expected_count and $expected_count words, got S2KCP031=$count_value words=$words_value"]
    }
  }
}

puts "Checked [llength $generated_procs] generated procs from $mock_file"
puts "Invocation failures: [llength $failed_calls]"
puts "Non-friendly argument names: [llength $non_friendly_args]"
puts "Payload labels using non-friendly IDs: [llength $payload_id_labels]"
puts "Payload labels not using non-friendly IDs: [llength $payload_non_id_labels]"
puts "Auto-count validation failures: [llength $auto_count_failures]"

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

if {[llength $auto_count_failures] > 0} {
  puts "Auto-count failure details:"
  foreach failure $auto_count_failures {
    puts "  [lindex $failure 0] -> [lindex $failure 1]"
  }
}
