# Builds app icons, splash and store art from the game art (title mock, G10 tavern, G1 forest, knight cut-outs).
# Run cut-knights.py first in the same folder. Output: apps/assets (for capacitor-assets) and apps/store/graphics.
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np, os, sys
A='/home/user/tavern-knights/apps/assets'; G='/home/user/tavern-knights/apps/store/graphics'
os.makedirs(A,exist_ok=True); os.makedirs(G,exist_ok=True)
mock=Image.open('/mnt/project-files/uploads/hearth/c3332f19-f806-4c1e-b0b9-6c7ba1efba41').convert('RGB')
tav=Image.open('/mnt/project-files/tavern-knights/art/gemini_G10_tavern.jpg').convert('RGB')
forest=Image.open('/mnt/project-files/tavern-knights/art/gemini_G1_forest_far.jpg').convert('RGB')
K={n:Image.open(n+'.png') for n in ['arthur','rosemary','percival']}
def bgsq(S,blur=5,bright=0.75,vig=True):
    W,H=tav.size; b=tav.crop((int(W*0.30),0,int(W*0.30)+H,H)).resize((S,S),Image.LANCZOS).filter(ImageFilter.GaussianBlur(blur*S/1024))
    b=ImageEnhance.Brightness(b).enhance(bright)
    if vig:
        y,x=np.mgrid[0:S,0:S]; d=np.sqrt((x-S/2)**2+(y-S*0.55)**2)/(S*0.75)
        b=Image.fromarray((np.asarray(b)*np.clip(1-d**2*0.9,0.25,1)[...,None]).astype(np.uint8))
    return b
def knights(canvas,S,ox=0,oy=0,scale=1.0):
    def put(n,h,cx,by,flip=False):
        im=K[n]; h=int(h*scale*S/1024); k=h/im.height; im=im.resize((max(1,int(im.width*k)),h),Image.LANCZOS)
        if flip: im=im.transpose(Image.FLIP_LEFT_RIGHT)
        canvas.paste(im,(int(ox+(cx-512)*scale*S/1024+S/2-im.width/2),int(oy+by*scale*S/1024-h)),im)
    put('rosemary',560,300,930,True); put('percival',560,735,930); put('arthur',700,520,1000)
def cover(img,w,h,box):
    return img.crop(box).resize((w,h),Image.LANCZOS)
# ---- app icon (iOS: no alpha) ----
ic=bgsq(1024); knights(ic,1024,oy=-20); ic.save(f'{A}/icon-only.png')
# Android adaptive: background + foreground in 66% safe zone
bgsq(1024,vig=False).save(f'{A}/icon-background.png')
fg=Image.new('RGBA',(1024,1024),(0,0,0,0)); knights(fg,1024,oy=150,scale=0.66); fg.save(f'{A}/icon-foreground.png')
# splash (centre logo region of 2732 square stays visible on all screens)
sp=Image.new('RGB',(2732,2732),(26,18,16)); knights(sp,2732,oy=2732*0.30,scale=0.42)
sign=mock.crop((388,40,992,252)); sw=1300; sign=sign.resize((sw,int(sign.height*sw/sign.width)),Image.LANCZOS)
sp.paste(sign,((2732-sw)//2,int(2732*0.30)))
sp.save(f'{A}/splash.png',optimize=True)
ic.save('/home/user/tavern-knights/apps/resources/icon.png')
# ---- store art (from the title art; crop stops above the menu text) ----
cover(mock,920,430,(140,0,1236,512)).save(f'{G}/steam_header_capsule_920x430.png')
cover(mock,1232,706,(295,0,1188,512)).save(f'{G}/steam_main_capsule_1232x706.png')
cover(mock,462,174,(388,33,992,260)).save(f'{G}/steam_small_capsule_462x174.png')
cover(mock,1024,500,(165,0,1213,512)).save(f'{G}/play_feature_graphic_1024x500.png')
# vertical capsules: sign on top, knights below
for (w,h,name) in [(600,900,'steam_library_capsule_600x900'),(748,896,'steam_vertical_capsule_748x896')]:
    W2=max(w,h); base=bgsq(W2,bright=0.6).crop(((W2-w)//2,(W2-h)//2,(W2-w)//2+w,(W2-h)//2+h))
    knights(base,w,oy=h-w*1.0,scale=1.0)
    s=mock.crop((388,40,992,252)); s=s.resize((int(w*0.92),int(s.height*w*0.92/s.width)),Image.LANCZOS)
    base.paste(s,((w-s.width)//2,int(h*0.05))); base.save(f'{G}/{name}.png')
# library hero: no text, wide forest
fw,fh=forest.size; hh=int(fw*1240/3840)
cover(forest,3840,1240,(0,(fh-hh)//2,fw,(fh-hh)//2+hh)).save(f'{G}/steam_library_hero_3840x1240.jpg',quality=92)
# Play store icon 512
ic.resize((512,512),Image.LANCZOS).save(f'{G}/play_icon_512.png')
print('done')
