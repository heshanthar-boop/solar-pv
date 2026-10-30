/* ===== Sri Lanka location presets (grouped by province) ===== */
const SL_LOCATIONS = [
  // Western
  ["Western","Colombo",6.9271,79.8612],
  ["Western","Sri Jayawardenepura Kotte",6.8880,79.9180],
  ["Western","Negombo",7.2083,79.8358],
  ["Western","Gampaha",7.0917,79.9999],
  ["Western","Kalutara",6.5854,79.9607],
  ["Western","Moratuwa",6.7730,79.8816],
  ["Western","Avissawella",6.9542,80.2098],
  ["Western","Horana",6.7156,80.0626],
  // Central
  ["Central","Kandy",7.2906,80.6337],
  ["Central","Matale",7.4675,80.6234],
  ["Central","Nuwara Eliya",6.9497,80.7891],
  ["Central","Dambulla",7.8742,80.6511],
  ["Central","Gampola",7.1640,80.5740],
  ["Central","Hatton",6.8913,80.5953],
  // Southern
  ["Southern","Galle",6.0535,80.2210],
  ["Southern","Matara",5.9549,80.5550],
  ["Southern","Hambantota",6.1241,81.1185],
  ["Southern","Tangalle",6.0241,80.7944],
  ["Southern","Tissamaharama",6.2839,81.2876],
  ["Southern","Ambalantota",6.1186,81.0098],
  ["Southern","Weligama",5.9730,80.4290],
  ["Southern","Baruthakanda (solar park)",6.2400,81.0500],
  // Northern
  ["Northern","Jaffna",9.6615,80.0255],
  ["Northern","Kilinochchi",9.3961,80.3982],
  ["Northern","Mannar",8.9810,79.9044],
  ["Northern","Vavuniya",8.7514,80.4971],
  ["Northern","Mullaitivu",9.2671,80.8142],
  ["Northern","Point Pedro",9.8167,80.2333],
  ["Northern","Pooneryn (solar)",9.5000,80.2200],
  // Eastern
  ["Eastern","Trincomalee",8.5874,81.2152],
  ["Eastern","Batticaloa",7.7170,81.7000],
  ["Eastern","Ampara",7.2970,81.6820],
  ["Eastern","Kalmunai",7.4167,81.8167],
  ["Eastern","Akkaraipattu",7.2167,81.8500],
  ["Eastern","Kantale",8.3636,81.0050],
  ["Eastern","Siyambalanduwa",6.9100,81.4970],
  // North Western
  ["North Western","Kurunegala",7.4863,80.3623],
  ["North Western","Puttalam",8.0344,79.8283],
  ["North Western","Chilaw",7.5758,79.7953],
  ["North Western","Kuliyapitiya",7.4690,80.0410],
  ["North Western","Wariyapola",7.6230,80.2310],
  // North Central
  ["North Central","Anuradhapura",8.3114,80.4037],
  ["North Central","Polonnaruwa",7.9403,81.0188],
  ["North Central","Kekirawa",8.0367,80.5897],
  ["North Central","Medawachchiya",8.5390,80.4990],
  ["North Central","Hingurakgoda",8.0420,80.9560],
  // Uva
  ["Uva","Badulla",6.9934,81.0550],
  ["Uva","Monaragala",6.8728,81.3510],
  ["Uva","Bandarawela",6.8290,80.9870],
  ["Uva","Wellawaya",6.7370,81.1020],
  ["Uva","Bibile",7.1620,81.2230],
  ["Uva","Buttala",6.7580,81.2390],
  ["Uva","Sevanagala",6.3700,80.9800],
  ["Uva","Embilipitiya",6.3430,80.8490],
  // Sabaragamuwa
  ["Sabaragamuwa","Ratnapura",6.6828,80.3992],
  ["Sabaragamuwa","Kegalle",7.2513,80.3464],
  ["Sabaragamuwa","Balangoda",6.6500,80.6980],
  ["Sabaragamuwa","Pelmadulla",6.6170,80.5380],
];

function populateLocations(sel){
  const byProv = {};
  SL_LOCATIONS.forEach(([p,n,la,lo])=>{ (byProv[p]=byProv[p]||[]).push([n,la,lo]); });
  let html = `<option value="">— search / pick a town —</option>`;
  Object.keys(byProv).forEach(p=>{
    html += `<optgroup label="${p} Province">`;
    byProv[p].forEach(([n,la,lo])=> html += `<option value="${la},${lo},${n}">${n}</option>`);
    html += `</optgroup>`;
  });
  sel.innerHTML = html;
}
