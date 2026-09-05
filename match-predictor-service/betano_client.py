"""OddsPapi/Betano adapter shared by global models; credentials stay server-side."""
from __future__ import annotations
import os, re
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
import requests

BASE="https://api.oddspapi.io/v4"
ALIASES={"lacoruna":("rcdeportivodeacoruna","deportivolacoruna"),"villarreal":("villarrealcf",),"vallecano":("rayovallecano",),"alaves":("deportivoalaves",),"oviedo":("realoviedo",),"mallorca":("rcdmallorca",)}
def _norm(value): return re.sub(r"[^a-z0-9]","",str(value).lower().translate(str.maketrans("áéíóúüñ","aeiouun")))
def _score(local, provider):
    a,b=_norm(local),_norm(provider); return max(1.0 if x in b or b in x else SequenceMatcher(None,x,b).ratio() for x in (a,*ALIASES.get(a,())))

def markets(home, away, days=7):
    key=os.getenv("ODDSPAPI_API_KEY")
    if not key: return [], "ODDSPAPI_API_KEY no configurada"
    try:
        now=datetime.now(timezone.utc); params={"apiKey":key,"sportId":10,"from":now.strftime("%Y-%m-%dT%H:%M:%SZ"),"to":(now+timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")}
        raw=requests.get(BASE+"/fixtures",params=params,timeout=15).json(); fixtures=raw.get("data",raw) if isinstance(raw,dict) else raw
        matched=[(_score(home,x.get("participant1Name","")),_score(away,x.get("participant2Name","")),x) for x in fixtures]; matched=[x for x in matched if x[0]>=.72 and x[1]>=.72]
        if not matched:return [],"Fixture Betano no encontrado"
        fixture=max(matched,key=lambda x:x[0]+x[1])[2]
        raw=requests.get(BASE+"/odds",params={"apiKey":key,"fixtureId":fixture["fixtureId"],"bookmakers":"betano","language":"en","verbosity":3},timeout=15).json(); book=raw.get("bookmakerOdds",{}).get("betano",{})
        if not book or book.get("suspended"):return [],"Betano no tiene cuotas activas"
        catalog=requests.get(BASE+"/markets",params={"apiKey":key,"sportId":10},timeout=15).json(); catalog=catalog.get("data",catalog) if isinstance(catalog,dict) else catalog; catalog={str(x.get("marketId")):x for x in catalog}
        out=[]
        for market_id,market in book.get("markets",{}).items():
            spec=catalog.get(str(market_id),{}); outcomes={str(x.get("outcomeId")):str(x.get("outcomeName","")) for x in spec.get("outcomes",[])}
            for outcome_id,outcome in market.get("outcomes",{}).items():
                for s in outcome.get("players",{}).values():
                    if s.get("active",True) and isinstance(s.get("price"),(int,float)) and s["price"]>1: out.append({"market":str(spec.get("marketName",market_id)),"type":str(spec.get("marketType","")),"line":spec.get("handicap"),"selection":outcomes.get(str(outcome_id),str(s.get("bookmakerOutcomeId",""))),"odds":float(s["price"])})
        return out,None
    except requests.RequestException as exc:return [],f"OddsPapi: {exc}"
