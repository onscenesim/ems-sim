(function(root){
  'use strict';
  function mount(doc, {autoInterpret=true}={}) {
    const el=id=>doc.getElementById(id);
    const selector=el('ecg-select'), dialog=el('ecg-dialog');
    let all=[], patient='patient_1', current=null;
    function draw(){
      current=all.find(e=>e.patientId===patient&&e.id===selector.value)||null;
      el('ecg-thumbnail').innerHTML=current?TwelveLead.svg(current,{autoInterpret}):'';
      if(dialog.open)el('ecg-paper').innerHTML=current?TwelveLead.svg(current,{autoInterpret}):'';
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
    selector.addEventListener('change',draw);
    el('ecg-open').addEventListener('click',()=>{if(!current)return;el('ecg-paper').innerHTML=TwelveLead.svg(current,{autoInterpret});dialog.showModal();});
    el('ecg-close').addEventListener('click',()=>dialog.close());
    el('ecg-zoom').addEventListener('click',()=>{
      const zoom=el('ecg-paper').classList.toggle('ecg-actual');
      el('ecg-zoom').setAttribute('aria-pressed',String(zoom));el('ecg-zoom').textContent=zoom?'Fit paper':'Actual size';
    });
    return {
      setAutoInterpret(enabled){autoInterpret=enabled;draw();},
      update(records){const last=all.at(-1)?.id;all=[...(records||[])];if(last!==all.at(-1)?.id)selector.value='';render();},
      setPatient(id){patient=id;render();},
      close(){if(dialog.open)dialog.close();}
    };
  }
  root.TwelveLeadViewer={mount};
})(globalThis);
