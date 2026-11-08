# Cuts the first standing pose of each knight from the Gemini hero sheets (E1-E3, magenta background)
# into arthur.png / rosemary.png / percival.png in the current folder. make-graphics.py uses them.
# Paths point at the project art folder; change them if your originals live elsewhere.
import numpy as np
from PIL import Image
from scipy import ndimage
def cut(path,out):
    im=np.asarray(Image.open(path).convert('RGB')).astype(float)
    r,g,b=im[...,0],im[...,1],im[...,2]
    mag=np.clip((np.minimum(r,b)-g-40)/110.0,0,1)
    alpha=1-mag
    fg=alpha>0.5
    lab,n=ndimage.label(ndimage.binary_dilation(fg,iterations=6))
    H=im.shape[0]
    cands=[]
    for i,s in enumerate(ndimage.find_objects(lab)):
        h=s[0].stop-s[0].start
        if s[0].start<H*0.35 and h>H*0.15: cands.append((s[1].start,i,s))
    cands.sort(); _,i,s=cands[0]
    a=alpha.copy(); a[lab!=i+1]=0
    sp=np.clip(np.minimum(r,b)-g,0,None)*np.clip(mag*2+0.3,0,1)*(a>0)
    rgb=im.copy(); rgb[...,0]-=sp*0.6; rgb[...,2]-=sp*0.6
    rgba=np.dstack([np.clip(rgb,0,255),a*255]).astype(np.uint8)[s]
    Image.fromarray(rgba).save(out); print(out,rgba.shape)
for name,p in [('arthur','gemini_E1_arthur_v2'),('rosemary','gemini_E2_rosemary'),('percival','gemini_E3_percival')]:
    cut(f'/mnt/project-files/tavern-knights/art/{p}.jpg',name+'.png')
