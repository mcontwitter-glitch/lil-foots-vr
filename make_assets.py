from PIL import Image
import os
B="/workspace/gold_char/src/Lil' Foots/"
S=512
cache={}
def L(cat,name):
    k=(cat,name)
    if k not in cache:
        cache[k]=Image.open(f"{B}{cat}/{name}.png").convert("RGBA").resize((S,S),Image.LANCZOS)
    return cache[k]
chars=[
 dict(bg="Bubblegum",fur="Black",clothes="Overalls",flex="BibFoot",mouth="Smile",eyes="Beady",head="Cowboy",acc="Rolex"),
 dict(bg="Blood",fur="Lava",clothes="None",flex=None,mouth="Toof",eyes="Demon Time",head="HALO",acc="Diamonds"),
 dict(bg="Abstract",fur="Yeti",clothes="Diaper",flex=None,mouth="Blue Pacifier",eyes="Icy",head="Green Beanie",acc="None"),
 dict(bg="Bubblegum",fur="Pink",clothes="Overalls",flex=None,mouth="Pink Pacifier",eyes="Pink Maxi",head="Pink Bow",acc="Diamonds"),
 dict(bg="Abstract",fur="Skunk Ape",clothes="None",flex="Big Lost",mouth="Smile",eyes="Night Vision",head="Top Hat",acc="Rolex"),
 dict(bg="Blood",fur="Snow Leopard",clothes="Overalls",flex=None,mouth="Frown",eyes="'Merica",head="Royalty",acc="None"),
]
bgs=os.listdir(B+"Background"); print(bgs)
for i,c in enumerate(chars):
    im=Image.new("RGBA",(S,S),(0,0,0,0))
    for cat,key in [("Fur Types","fur"),("Clothes","clothes"),("Flex","flex"),("Mouth","mouth"),("Eyes","eyes"),("Head","head"),("Accessories","acc")]:
        n=c[key]
        if n and n!="None": im.alpha_composite(L(cat,n))
    im.save(f"assets/foot{i}.png",optimize=True)
    full=L("Background",c["bg"]).copy(); full.alpha_composite(im)
    full.convert("RGB").save(f"assets/card{i}.jpg",quality=82)
g=Image.open("/workspace/gold_char/gold_character_red_flipped.jpg").convert("RGB"); g.thumbnail((1024,1024)); g.save("assets/gold.jpg",quality=82)
g=Image.open("/workspace/gold_char/gold_character.png"); print(g.size,g.mode); g=g.convert("RGBA"); g.thumbnail((1024,1024)); g.save("assets/gold.png",optimize=True)
