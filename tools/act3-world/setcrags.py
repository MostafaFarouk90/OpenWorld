# python3 tools/act3-world/setcrags.py NAME=crags[:radius[:profile]] ...  (edits dragonspine.ts in place)
import sys
p='src/terrain/shape/dragonspine.ts'
s=open(p).read()
def setf(s, name, field, val):
    i=s.index('export const %s:'%name)
    end=s.index('};',i)
    j=s.find(field+':',i,end)
    if j<0:
        k=s.index('ceiling:',i)
        return s[:k]+'%s: %s,\n  '%(field,val)+s[k:]
    k=min(x for x in (s.find(',',j),s.find('}',j)) if x>0)
    return s[:j]+'%s: %s'%(field,val)+s[k:]
for a in sys.argv[1:]:
    name,v=a.split('=')
    parts=v.split(':')
    for field,val in zip(['crags','radius','profile'],parts):
        if val: s=setf(s,name,field,val)
open(p,'w').write(s)
