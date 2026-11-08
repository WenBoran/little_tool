# sweep.sh "label|OV" ...  每组跑 none / smart / rand
for spec in "$@"; do
  lab="${spec%%|*}"; ov="${spec#*|}"
  ( r=$(for p in none smart rand; do OV="$ov" node sim.js ../cur $p ${N:-300}; done); echo "== $lab"; echo "$r" ) > /tmp/sw_$(echo "$lab" | md5sum | cut -c1-8).txt &
done; wait
for spec in "$@"; do lab="${spec%%|*}"; cat /tmp/sw_$(echo "$lab" | md5sum | cut -c1-8).txt; done
