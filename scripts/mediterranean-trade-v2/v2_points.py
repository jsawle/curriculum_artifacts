"""v2 points: v1 hubs re-sourced to Pleiades + colonies and founder cities from Pleiades 'founded by' links and description statements."""
import pandas as pd, json, sys, re
sys.path.insert(0,'work'); from sites import SITES
G='v2src/pl/data/gis/'
P=pd.read_csv(G+'places.csv',encoding='utf-8-sig',low_memory=False); P['id']=pd.to_numeric(P['id'],errors='coerce'); PI=P.set_index('id')
C=pd.read_csv(G+'connections.csv',encoding='utf-8-sig',low_memory=False)
H=json.load(open('v2src/pleiades_hubs.json'))
OVR={'Rome':423025,'Cyrene':373778,'Angers':138400}
for n,pid in OVR.items(): H[n]={'pid':pid}
DROP={'Tanais':'Pleiades dates the city of Tanais to the 3rd century BCE, after this map\'s period'}
def pl(pid):
    r=PI.loc[pid]; return dict(pleiades_id=int(pid),pleiades_title=r['title'],lat=float(r.representative_latitude),lon=float(r.representative_longitude),pleiades_uri=f"https://pleiades.stoa.org/places/{int(pid)}")
NET=lambda a:"Phoenician-Punic" if ('Phoenician' in a or 'Punic' in a) else ("Hellenic" if 'Greek' in a else ("Persian" if 'Persian' in a else ("Etruscan" if 'Etruscan' in a else "Local / other")))
pts={}
for n,(mod,la,lo,aff,kind) in SITES.items():
    if n in DROP: continue
    base=dict(name=n,modern=mod,affiliation=aff,network=NET(aff),site_type=kind,role='trading hub')
    if H.get(n) and H[n].get('pid'): base.update(pl(H[n]['pid'])); base['loc_source']='Pleiades representative point (CC BY 3.0)'
    else: base.update(lat=la,lon=lo,loc_source='Mogador island Phoenician site; not in Pleiades (coordinates of the island)')
    pts[n]=base
# ---- foundation links: Pleiades connections (founded by), dated within the period
F=C[C.connection_type=='founded'].copy(); F['target']=pd.to_numeric(F.connects_to.str.extract(r'places/(\d+)')[0])
links=[]
pid2name={v['pleiades_id']:k for k,v in pts.items() if 'pleiades_id' in v}
PT=pd.read_csv(G+'places_place_types.csv',encoding='utf-8-sig'); ptypes=PT.groupby('place_id').place_type.apply(set).to_dict()
SETTLE={'settlement','port','urban','emporion','hillfort','oppidum','archaeological-site'}
def ensure(pid,role,net):
    if pid in pid2name: return pid2name[pid]
    if not (ptypes.get(pid,set()) & SETTLE): return None      # skip regions, islands, kingdoms, sanctuaries, baths
    r=PI.loc[pid]
    if pd.isna(r.representative_latitude): return None
    nm=str(r['title']).split('/')[0].strip()
    pts[nm]=dict(name=nm,modern='',affiliation='Greek' if net=='Hellenic' else net,network=net,site_type='colony' if role=='colony' else 'mother city',role=role,**pl(pid),loc_source='Pleiades representative point (CC BY 3.0)')
    pid2name[pid]=nm; return nm
for _,r in F.iterrows():
    a,b=r.year_after_which,r.year_before_which
    if pd.notna(a) and a>=-330: continue         # founded after the period
    if pd.notna(b) and b<-900: continue
    if not (ptypes.get(int(r.place_id),set()) & SETTLE and ptypes.get(int(r.target),set()) & SETTLE): continue
    if 'Sanctuary' in str(PI.loc[int(r.place_id)]['title']): continue
    col=ensure(int(r.place_id),'colony','Hellenic'); fnd=ensure(int(r.target),'mother city','Hellenic')
    if col and fnd and col!=fnd:
        links.append(dict(colony=col,founder=fnd,source=f"Pleiades connection 'founded by' ({r['uri']})"))
# ---- founder statements in Pleiades descriptions of hubs (quoted in 'evidence')
DESC=[("Massilia","Phokaia","founded by Phocaean Greeks ca. 600 B.C."),("Poseidonia / Paestum","Sybaris","Greeks from Sybaris originally founded Poseidonia/Paestum"),
      ("Epidamnos","Corinthus/Korinthos","founded in 627 B.C. by colonists from Corinth and Kerkyra"),("Epidamnos","Korkyra","founded in 627 B.C. by colonists from Corinth and Kerkyra"),
      ("Tyras","Miletus","A Black Sea colony founded by Miletus."),("Chersonesos","Herakleia Pontike","Settlers from Heraclea Pontica"),
      ("Theodosia","Miletus","A Greek colony founded by Miletus in the sixth century BC."),("Pantikapaion","Miletus","founded by Miletus in the late seventh or early sixth centuries B.C."),
      ("Hippo Regius","Tyrus","a colony established by Phoenicians from Tyre"),("Thasos","Paros","Greeks from Paros founded a colony on Thasos"),("Syracuse","Corinthus/Korinthos","founded ... as a colony of Corinth in 734/3 B.C.")]
FPID={"Phokaia":550823,"Sybaris":None,"Corinthus/Korinthos":570182,"Korkyra":530834,"Miletus":599799,"Herakleia Pontike":844944,"Tyrus":678437,"Paros":599867}
for col,ftitle,quote in DESC:
    fpid=FPID.get(ftitle)
    if fpid is None:
        m=P[P.title.astype(str).str.fullmatch(re.escape(ftitle))].dropna(subset=['representative_latitude'])
        if not len(m): print('founder not found',ftitle); continue
        fpid=int(m.iloc[0]['id'])
    net='Phoenician-Punic' if ftitle.startswith('Tyr') else 'Hellenic'
    fnd=ensure(fpid,'mother city',net)
    if not any(l['colony']==col and l['founder']==fnd for l in links):
        links.append(dict(colony=col,founder=fnd,source=f"Pleiades description of {col}: \"{quote}\" ({pts[col].get('pleiades_uri','')})"))
# affiliation corrections from Pleiades descriptions
pts['Lucentum'].update(affiliation='Phoenician, later Roman (Pleiades)',network='Phoenician-Punic')
for k,v in list(pts.items()):
    if k.endswith(' (settlement)'):
        nk=k.replace(' (settlement)','');
        if nk not in pts: pts[nk]=v; v['name']=nk; del pts[k]
        for l in links:
            for f in ('colony','founder'):
                if l[f]==k: l[f]=nk
json.dump({'points':pts,'links':links,'dropped':DROP},open('v2src/v2_points.json','w'),indent=1,ensure_ascii=False)
print(len(pts),'points;',sum(1 for p in pts.values() if p['role']!='trading hub'),'added colonies/founders;',len(links),'foundation links')
print('added:',sorted(k for k,v in pts.items() if v['role']!='trading hub'))
