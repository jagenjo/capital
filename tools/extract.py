# Extracts sprites from original Capitalism (1995) .RES files into PNG (dev tool, run once).
import struct, sys, os
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
pal = open(f'{src}/PAL_STD.RES','rb').read()[:768]
pal = [min(255, (b & 63) * 255 // 63) for b in pal]
def save(name, w, h, px, sub):
    if not (0 < w <= 640 and 0 < h <= 480) or len(px) < w*h: return False
    im = Image.frombytes('P', (w, h), px[:w*h]); im.putpalette(pal)
    os.makedirs(f'{out}/{sub}', exist_ok=True)
    im.save(f'{out}/{sub}/{name}.png'); return True
# raw sequential: I_PERSON
d = open(f'{src}/I_PERSON.RES','rb').read(); p=0; n=0
while p+8 <= len(d):
    ln,w,h = struct.unpack('<IHH', d[p:p+8]); save(f'{n:02d}', w, h, d[p+8:p+4+ln], 'person'); p += 4+ln; n+=1
# index files
def named(f, sub, stride=13, nlen=9):
    d = open(f'{src}/{f}.RES','rb').read(); cnt = struct.unpack('<H', d[:2])[0]; c=0
    for i in range(cnt):
        e = d[2+i*stride:2+(i+1)*stride]; nm = e[:nlen].split(b'\0')[0].decode('latin1'); off = struct.unpack('<I', e[nlen:])[0]
        base = 2+cnt*stride
        for o in (off, off+base):
            w,h = struct.unpack('<HH', d[o:o+4]) if o+4<=len(d) else (0,0)
            if save(nm.replace('/','_'), w, h, d[o+4:o+4+w*h], sub): c+=1; break
    print(f, cnt, c)
def numbered(f, sub):
    d = open(f'{src}/{f}.RES','rb').read(); cnt = struct.unpack('<H', d[:2])[0]; c=0
    offs = [struct.unpack('<I', d[2+i*4-1+1:2+i*4+4-1+1])[0] for i in range(cnt)]
    for i,o in enumerate(offs):
        for oo in (o, o+2+cnt*4):
            if oo+4>len(d): continue
            w,h = struct.unpack('<HH', d[oo:oo+4])
            if save(f'{i:02d}', w, h, d[oo+4:oo+4+w*h], sub): c+=1; break
    print(f, cnt, c)
for f,s in [('I_PICT','pict'),('I_TITLE','title'),('I_SCEN','scen'),('I_SYM','sym'),('I_SYS','sys'),('I_TILE','tile'),('I_METHOD','method'),('I_FARM','farm')]:
    try: named(f, s)
    except Exception as e: print(f, 'err', e)
for f,s in [('I_BUILD','build'),('I_LOGO','logo'),('I_LAND','land')]:
    try: numbered(f, s)
    except Exception as e: print(f, 'err', e)
