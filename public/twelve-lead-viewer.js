(function(root){
  'use strict';
  function mount(doc, {autoInterpret=true}={}) {
    const el=id=>doc.getElementById(id);
    const selector=el('ecg-select'), dialog=el('ecg-dialog');
    let all=[], patient='patient_1', current=null, displayed=null;
    function draw(){
      current=all.find(e=>e.patientId===patient&&e.id===selector.value)||null;
      el('ecg-thumbnail').innerHTML=current?TwelveLead.svg(current,{autoInterpret,idPrefix:'ecg-thumbnail'}):'';
      if(dialog.open)el('ecg-paper').innerHTML=displayed?TwelveLead.svg(displayed,{autoInterpret,idPrefix:'ecg-paper'}):'';
    }
    function render(){
      const previous=selector.value;
      const list=all.filter(e=>e.patientId===patient);
      selector.replaceChildren();
      for(const [i,e] of list.entries()) {
        const option=doc.createElement('option');option.value=e.id;
        option.textContent=`${i+1} · T+${Number(e.minute).toFixed(1)} min · ${e.quality}`;
        selector.appendChild(option);
      }
      selector.value=list.some(e=>e.id===previous)?previous:list.at(-1)?.id||'';
      el('ecg-empty').hidden=!!list.length;el('ecg-recordings').hidden=!list.length;
      el('ecg-count').textContent=`${list.length} recording${list.length===1?'':'s'}`;
      draw();
    }
    function open(record=current){
      if(!record)return;
      displayed=record;
      el('ecg-paper').classList.remove('ecg-actual');
      el('ecg-zoom').setAttribute('aria-pressed','false');el('ecg-zoom').textContent='Actual size';
      el('ecg-paper').innerHTML=TwelveLead.svg(record,{autoInterpret,idPrefix:'ecg-paper'});
      if(!dialog.open)dialog.showModal();
    }
    selector.addEventListener('change',()=>{draw();if(dialog.open)open(current);});
    el('ecg-open').addEventListener('click',()=>open());
    dialog.addEventListener('close',()=>{displayed=null;});
    el('ecg-close').addEventListener('click',()=>dialog.close());
    el('ecg-zoom').addEventListener('click',()=>{
      const zoom=el('ecg-paper').classList.toggle('ecg-actual');
      el('ecg-zoom').setAttribute('aria-pressed',String(zoom));el('ecg-zoom').textContent=zoom?'Fit paper':'Actual size';
    });
    return {
      setAutoInterpret(enabled){autoInterpret=enabled;draw();},
      update(records,{openNew=false}={}){
        const known=new Set(all.map(e=>e.id)),last=all.at(-1)?.id;
        all=[...(records||[])];
        const acquired=all.filter(e=>!known.has(e.id)).at(-1);
        if(last!==all.at(-1)?.id)selector.value='';
        render();
        // Only live turn responses opt in. Restore, patient switches, repeated
        // responses and reopening More Vitals must not summon old printouts.
        if(openNew&&acquired)open(acquired);
      },
      setPatient(id){patient=id;render();},
      close(){if(dialog.open)dialog.close();}
    };
  }
  root.TwelveLeadViewer={mount};
})(globalThis);
