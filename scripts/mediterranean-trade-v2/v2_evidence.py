"""v2 evidence sites from Pleiades (CC BY 3.0): culture from Pleiades descriptions, dated to overlap 700-350 BCE."""
import pandas as pd, re, json
G='v2src/pl/data/gis/'
P=pd.read_csv(G+'places.csv',encoding='utf-8-sig',low_memory=False); P['id']=pd.to_numeric(P['id'],errors='coerce')
PT=pd.read_csv(G+'places_place_types.csv',encoding='utf-8-sig'); L=pd.read_csv(G+'location_points.csv',encoding='utf-8-sig',low_memory=False)
types=PT.groupby('place_id').place_type.apply(lambda s:sorted(set(s))).to_dict()
OK={'settlement','port','urban','emporion','hillfort','oppidum','archaeological-site','sanctuary','cemetery','temple','temple-2','fort'}
L=L.dropna(subset=['year_after_which','year_before_which'])
inper=set(L[(L.year_after_which<=-350)&(L.year_before_which>=-700)].place_id)
P=P[P['id'].isin(inper)&P['id'].map(lambda i: bool(set(types.get(i,[]))&OK))&P.representative_longitude.between(-14,50)&P.representative_latitude.between(24,56)].copy()
P['txt']=(P.description.fillna('')+' '+P.details.fillna('')).str.replace(r'<[^>]+>',' ',regex=True).str.replace(r'Punic Wars?','',regex=True)
RX={'Phoenician-Punic':r'\b(?:Phoenician|Punic|Carthaginian)\b',
    'Greek':r'\bGreek (?:colon|polis|city|settlement|trading|emporion|foundation|sanctuary)|\b(?:Milesian|Phocaean|Megarian|Corinthian|Euboean|Chalcidian|Ionian|Dorian) (?:colon|Greek|settler|foundation)|\bcolony of (?:Miletus|Corinth|Megara|Phocaea|Chalcis|Eretria|Paros|Thera|Sparta|Rhodes|Samos|Syracuse|Gela|Zancle|Massalia|Taras|Sybaris|Croton|Locri)',
    'Etruscan':r'\bEtruscan\b','Hallstatt':r'\bHallstatt\b'}
ev=[]
for cult,rx in RX.items():
    m=P[P.txt.str.contains(rx,regex=True)]
    for _,r in m.iterrows():
        ev.append(dict(culture=cult,pleiades_id=int(r['id']),title=r['title'],lat=float(r.representative_latitude),lon=float(r.representative_longitude),
                       uri=f"https://pleiades.stoa.org/places/{int(r['id'])}",evidence=re.sub(r'\s+',' ',str(r.description))[:240]))
E=pd.DataFrame(ev); E.to_csv('v2src/evidence_sites.csv',index=False)
print(E.culture.value_counts().to_dict())
for c in ['Phoenician-Punic','Greek']:
    print(c, E[E.culture==c].title.head(40).tolist())
