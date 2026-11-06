import pandas as pd, numpy as np, sys, re, unicodedata, json
sys.path.insert(0,'/home/claude/work'); from sites import SITES
P=pd.read_csv('places.csv',encoding='utf-8-sig',low_memory=False); N=pd.read_csv('names.csv',encoding='utf-8-sig',low_memory=False)
PT=pd.read_csv('places_place_types.csv',encoding='utf-8-sig',low_memory=False)
P['id']=pd.to_numeric(P['id'],errors='coerce'); P=P.dropna(subset=['representative_latitude'])
def norm(s): s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower(); return re.sub(r'[^a-z ]',' ',s)
names=N.groupby('place_id').apply(lambda d:' '.join(norm(x) for x in pd.concat([d.romanized_form_1,d.romanized_form_2,d.romanized_form_3,d.title]).dropna())).to_dict()
P['allnames']=P.apply(lambda r: norm(r['title'])+' '+names.get(r['id'],''),axis=1)
OK_TYPES={'settlement','urban','port','emporion','hillfort','oppidum','city','town','archaeological-site','sanctuary','island','settlement-modern'}
ptypes=PT.groupby('place_id')['place_type'].apply(set).to_dict()
P['types']=P['id'].map(lambda i: ptypes.get(i,set()))
P=P[P['types'].apply(lambda t: bool(t & OK_TYPES))]
BAD=('Roman ','Theater','Theatre','Temple','Tomb','Baths','Garden','Acropolis','Archaic agora','Heroon','Second Temple','Kition:','amphitheater','cemetery','Treasury','Umbilicus','Road')
P=P[~P['title'].astype(str).str.contains('|'.join(BAD),case=False,regex=True) | P['title'].astype(str).str.fullmatch('Delos|Rome')]
# manual name keys (ancient forms) for matching
KEY={"Vix / Mont Lassois":"lassois","Emporion":"emporion","Atria":"atria hatria adria","Alalia (Atalia)":"alalia aleria","Kyme (Cumae)":"cumae kyme","Poseidonia / Paestum":"poseidonia paestum","Taras / Tarentum":"taras tarentum","Brentesion / Brundisium":"brundisium brentesion","Kerkyra Melaina":"korkyra melaina corcyra nigra","Epidamnos":"epidamnos dyrrhachium","Gadir (Cadiz)":"gadir gades gadeira","Malaka":"malaca malaka","Lucentum":"lucentum","Ebusus":"ebusus","Palma":"palma","Mago":"mago","Motya":"motya motye","Syracuse":"syracusae syrakousai","Hippo Regius":"hippo regius","Cartenna":"cartenna cartennae","Lixus":"lixus","Mogador":"mogador","Leptis Magna":"lepcis leptis","Corinth":"korinthos corinthus","Tiryns":"tiryns","Sparta":"sparta lacedaemon","Phaleron":"phaleron","Delos":"delos","Kommos":"kommos","Thasos":"thasos","Byzantion":"byzantium byzantion","Sardis":"sardis","Ephesus":"ephesus ephesos","Miletos":"miletus miletos","Mesambria":"mesembria mesambria","Apollonia Pontica":"apollonia","Istros":"histria istros istria","Tyras":"tyras","Olbia":"olbia","Chersonesos":"chersonesos chersonesus","Theodosia":"theodosia","Pantikapaion":"pantikapaion panticapaeum","Tanais":"tanais","Sinope":"sinope","Phasis":"phasis","Tarsos":"tarsus tarsos","Paphos":"paphos","Salamis":"salamis","Kition":"kition citium","Sidon":"sidon","Tyre":"tyrus tyros","Damascus":"damascus","Jerusalem":"hierosolyma jerusalem","Petra":"petra","Naukratis":"naukratis naucratis","Memphis":"memphis","Thebes":"thebai diospolis","Babylon":"babylon","Susa":"susa","Angers":"juliomagus andecavi","Heuneburg":"heuneburg","Massilia":"massalia massilia","Atria":"atria hatria","Spina":"spina","Pisa":"pisae","Populonia":"populonia","Tarquinia":"tarquinii","Cerveteri":"caere","Rome":"roma","Capua":"capua","Neapolis":"neapolis","Tartessos":"tartessos tartessus","Utica":"utica","Carthage":"carthago karchedon","Cyrene":"cyrene kyrene","Delphi":"delphi delphoi","Rome":"roma","Delos":"delos","Eretria":"eretria","Athens":"athenae athenai"}
out={}
lat=P.representative_latitude.values; lon=P.representative_longitude.values
for n,(mod,la,lo,aff,kind) in SITES.items():
    d=np.hypot((lat-la)*111,(lon-lo)*111*np.cos(np.radians(la)))
    keys=KEY.get(n,norm(n)).split()
    cand=P.assign(d=d)[d<25]
    m=cand[cand.allnames.apply(lambda s:any(k in s.split() or k in s for k in keys))].sort_values('d')
    if len(m): r=m.iloc[0]; out[n]=dict(pid=int(r['id']),title=r['title'],lat=float(r.representative_latitude),lon=float(r.representative_longitude),d_km=round(float(r.d),1),desc=str(r.description)[:300] if pd.notna(r.description) else '')
    else: out[n]=None
json.dump(out,open('/home/claude/v2src/pleiades_hubs.json','w'),indent=1,ensure_ascii=False)
miss=[n for n,v in out.items() if v is None]; far=[(n,v['title'],v['d_km']) for n,v in out.items() if v and v['d_km']>5]
print(len(out)-len(miss),'matched; missing:',miss); print('matched >5 km away:',far)
