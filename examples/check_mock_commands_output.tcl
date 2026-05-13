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
  set proc_args [info args $proc_name]
  set args {}
  set total [llength $proc_args]
  for {set i 0} {$i < $total} {incr i} {
    set arg [lindex $proc_args $i]
    if {$arg eq "args"} {
      continue
    }
    if {[info default $proc_name $arg _default]} {
      set has_later_required 0
      for {set j [expr {$i + 1}]} {$j < $total} {incr j} {
        set later_arg [lindex $proc_args $j]
        if {$later_arg eq "args"} {
          continue
        }
        if {![info default $proc_name $later_arg _later_default]} {
          set has_later_required 1
          break
        }
      }
      if {$has_later_required} {
        lappend args ""
      }
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

proc payload_values {payload label} {
  set values {}
  foreach param_entry [lrange $payload 1 end] {
    if {[lindex $param_entry 0] eq $label} {
      lappend values [lindex $param_entry 1]
    }
  }
  return $values
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
    if {$count_value != $expected_count || [llength $words_value] != $expected_count} {
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
    if {$count_value != $expected_count || [llength $words_value] != $expected_count} {
      lappend auto_count_failures [list TC_6_2 "Expected S2KCP031=$expected_count and $expected_count words, got S2KCP031=$count_value words=$words_value"]
    }
  }
}

if {[llength [info procs TC_3_1]] > 0} {
  set hk_ids [list PID_A PID_B]
  set expected_count [llength $hk_ids]
  if {[catch {set payload [TC_3_1 HK_SID_1 $hk_ids]} err]} {
    lappend auto_count_failures [list TC_3_1 $err]
  } else {
    set count_value [payload_value $payload S2KCP015]
    set id_values [payload_values $payload S2KCP016]
    if {$count_value != $expected_count || [llength $id_values] != $expected_count} {
      lappend auto_count_failures [list TC_3_1 "Expected S2KCP015=$expected_count and $expected_count S2KCP016 values, got S2KCP015=$count_value values=$id_values"]
    }
  }
}

if {[llength [info procs TC_14_5]] > 0} {
  set pid_values [list 1 2]
  set sid_values [list 11 12]
  set expected_count [llength $pid_values]
  if {[catch {set payload [TC_14_5 $pid_values $sid_values]} err]} {
    lappend auto_count_failures [list TC_14_5 $err]
  } else {
    set count_value [payload_value $payload S2KCP065]
    set payload_pids [payload_values $payload S2KCP066]
    set payload_sids [payload_values $payload S2KCP067]
    if {$count_value != $expected_count || [llength $payload_pids] != $expected_count || [llength $payload_sids] != $expected_count} {
      lappend auto_count_failures [list TC_14_5 "Expected S2KCP065=$expected_count and $expected_count PID/SID values, got S2KCP065=$count_value pid=$payload_pids sid=$payload_sids"]
    }
  }

  if {![catch {TC_14_5 [list 1 2] [list 11]}]} {
    lappend auto_count_failures [list TC_14_5 "Expected list-length mismatch to raise an error"]
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
