// Productcatalogus voor de tab "Producten bestellen" (dashboard.html).
//
// Bron: Productcatalogus_met_artnrs.csv (Señor Snacks). De ruwe CSV staat
// hieronder ingebed zodat de pagina geen losse fetch nodig heeft en altijd
// werkt, ook offline. Wil je de lijst updaten? Plak gewoon een nieuwe export
// van dezelfde kolommen tussen de backticks — de parser doet de rest.
//
// Kolommen: Categorie;Naam;Art.nr VZ;Omschrijving VZ;Art.nr AC-VH;Omschrijving AC-VH;AC invullen
//   • VZ    = Van Zon
//   • AC-VH = Agora Culinair / Van Hout
//
// De CSV is ooit als UTF-8 geëxporteerd maar als Latin-1 gelezen, waardoor
// accenten als "Ã©" verschijnen. fix() herstelt dat per veld; lukt het niet,
// dan blijft de originele tekst staan (nooit blokkeren).
(function () {
  var CSV = `Categorie;Naam;Art.nr VZ;Omschrijving VZ;Art.nr AC-VH;Omschrijving AC-VH;AC invullen
;Frikandel;629;FRIKANDEL MEGA-FRIK 40X100G VAN ZON;40415;Frikandel excellent #101 Agora Culinair 40x1;
;kipcorn;62187;KIPCROKSTICK 24X80G DV VAN ZON;40969;Kipcroq Agora Culinair 36x80g;
;belcanto/sunbrero;81907;SUNBRERO 15X140G VAN ZON;41297;Â¡Caramba! 14+1 gratis #143 Agora Culinair 15;
;krokidel (giantdel);883;GIANTDELLEN (KROKIDEL) 20X100G VAN ZON;40848;Krokandel #142 Agora Culinair 20x100g;
;boulet;655;BOELET 24X140G VAN ZON;40341;Gehaktbal #141 Agora Culinair 24x140g;
;cervela;915;CERVELA ROOD 5X6X140G VR;40758;Cervela rood #132 Agora Culinair 30x140g;
;Braadworst;919;BRAADWORST WIT 24X150G VR;40820;Braadworst wit blauw Vanreusel 24x150g;
;Bami laan;762;BAMIBLOK (VEGGIE) 24X125G LAAN;40270;Bamihap blok zonder vlees Laan 24x125g;
;kaaskroket;13704;KAASKROKET 24X80G PB;61563;;
;Americaine;24742;AMERICAIN 3L PET PAUWELS;50534;Americainesaus Pauwels 3l;
;Andalouse 3L;24743;ANDALOUSE 3L PET PAUWELS;50536;Andalousesaus Pauwels 3l;
;Andalouse 5 L;52845;ANDALOUSE CHEF BIB 5L PAUWELS;50244;Andalousesaus chef BIB Pauwels 5l;
;Bicky Dressing 3L;812;BICKY DRESSING TUBE 900ML;;;
;Bicky Dressing 5l;43067;BICKY BOMBER DRESSING 2,5KG;;;
;Bicky Hot;815;BICKY HOT SAUS TUBE 840ML;;;
;Bicky Hot 3L;815;BICKY HOT SAUS TUBE 840ML;;;
;Bicky Hot 5 L;43069;BICKY BOMBER HOT SAUS 2,8KG;;;
;Bolognaise Saus Manna;73433;BOLOGNAISE SAUS CHEF POUCH 2KG MANNA;52114;Bolognaise chef pouch Manna 3x2kg;
;Box 5 L + Pompen;1291;AMERICAIN 5L BIB PAUWELS;;;
;Cocktail Saus 10 L;24744;COCKTAILSAUS 3L PET PAUWELS;50296;Cocktailsaus Pauwels 10l;
;Cocktail Saus 3l;24744;COCKTAILSAUS 3L PET PAUWELS;51407;Cocktailsaus Pauwels 3l;
;Curry Ketchup 5L Bib;15453;CURRY KETCHUP 2X5KG BIB ZEISNER;51502;Curryketchup BIB Zeisner 2x5kg;
;Currysaus Geel 3l;24745;CURRYSAUS 3L PET PAUWELS;50490;Curryketchup Pauwels 3l;
;Emmer Tomaten Ketchup Pauwels 10l;;;51258;Tomatenketchup Pauwels 10l;
;Gele Curry;24745;CURRYSAUS 3L PET PAUWELS;50490;Curryketchup Pauwels 3l;
;Giga Saus Pauwels;;;50448;Hamburgersaus giga Pauwels 3l;
;Happy ( Joppi ) Saus 5 L;39234;HAPPYSAUS 5L BIB PAUWELS;50746;Smoelsaus (Happy saus) BIB Pauwels 5l;
;HELA Curry Ketchup;;;;;
;Hollandse Mayo Oliehoorn 10L;12353;FRIETSAUS 35% 10L OLIEHOORN;53020;Frietsaus zoet 35% Hollandse Pauwels 10l;
;Joppi Saus (smoelsaus) 3L;39233;HAPPYSAUS 3L PET PAUWELS;50748;Smoelsaus (Happy saus) pot Pauwels 3l;
;Ketchup Pomp Curry;15453;CURRY KETCHUP 2X5KG BIB ZEISNER;51502;Curryketchup BIB Zeisner 2x5kg;
;Ketchup Pomp Tomaat;15452;TOMATENKETCHUP 2X5KG BIB ZEISNER;58142;Tomatenketchup BIB Zeisner 2x5kg;
;Looksaus 3l;1304;LOOKSAUS 5L BIB PAUWELS;55025;Looksaus Pauwels 3l;
;Mayo 10L;10682;MAYO CHEF 10L PAUWELS;57404;Mayo chef Pauwels 10l;
;Mosterd 3L;24753;MOSTERD 3L PET PAUWELS;56123;Mosterd Pauwels 3l;
;Pickles 3L;;;10116;Komkommerschijfjes bokaal Senses 2,65l;
;Pomp 3 L;;;;;
;Pomp 3l Zoveel Mogelijk Potten Met Pomp Nemen;;;;;
;Pomp Mayo 10l;10682;MAYO CHEF 10L PAUWELS;57404;Mayo chef Pauwels 10l;
;Samurai 3L;24756;SAMURAISAUS 3L PET PAUWELS;57382;Samuraisaus Pauwels 3l;
;Samurai 5l Zak;77684;SAMURAI 2X5L BIB PAUWELS;52270;Samuraisaus BIB Pauwels 2x5l;
;Satesaus;10389;SATESAUS CLASSIC KANT-EN-KLAAR 2,5KG WIJKO;51850;SatÃ©saus classic kant-en-klaar Wijko 2,5kg;
;Smockey Bbq Saus;;;51489;Hamburgersaus smoky BBQ Black Jack Remia 800;
;Sweet Chili Saus;;;51327;Sweet chilisaus Savico 1l;
;Tartaar 3L;77621;TARTAAR DE LUXE 3L PET PAUWELS;57949;Tartaar de luxe Pauwels 3l;
;Tartaar 5 L;34910;TARTAAR DELUXE 5L BIB PAUWELS;50615;Tartaar de luxe BIB Pauwels 5l;
;Tomaten Ketchup Bib;15452;TOMATENKETCHUP 2X5KG BIB ZEISNER;58142;Tomatenketchup BIB Zeisner 2x5kg;
;Aardappelpuree;63000;AARDAPPELPUREE BINTJE 2,5KG LUTOSA;20263;Aardappelpuree bintje Lutosa 2,5kg;
;Amigo ( Mexicano ) OVI;895;MEXICANO 15X135G DE VRIES;;;
;Appelcake;;;;;
;Baguette 27 Cm;73862;PAST. 223282 HALF STOKBROOD PLUS WIT 27CM 40;;artnr invullen bij AC-VH;ja
;Bami;762;BAMIBLOK (VEGGIE) 24X125G LAAN;40270;Bamihap blok zonder vlees Laan 24x125g;
;Bami Laan 24 St;762;BAMIBLOK (VEGGIE) 24X125G LAAN;40270;Bamihap blok zonder vlees Laan 24x125g;
;Beef Burger;49618;BLACK ANGUS BEEF BURGER 40X100G VR;40125;Hamburger black Angus beef Vanreusel 40x100g;
;Beef Burger Nederland;49618;BLACK ANGUS BEEF BURGER 40X100G VR;;;
;Beef Burger Rato ( Nederland );49618;BLACK ANGUS BEEF BURGER 40X100G VR;;;
;Belcanto;876;BELCANTO 15X140G VR;40279;Belcanto ProHalal Vanreusel 15x140g;
;Bickey Broodjes Sesam;40745;LA LORR. 3888 HAMBURGERBROODJE SESAM 24X86G;21937;Hamburger bun sesam pre-sliced T&S 2103888 Ã;
;Bitterballen Agora;40092;DE JONG RUNDVLEES BITTERBAL â via VZ art 60766;40092;Bitterbal rundvlees De Jong 65x30g;
;Bitterballen De Jong ( De Luxe );60766;DE JONG RUNDVLEES BITTERBAL 25% 65X30G DV;40092;Bitterbal rundvlees De Jong 65x30g;
;Bockworst Van Reusel;;;40560;Bockworst zonder vel rood Vanreusel 24x125g;
;Boeletstick;655;BOELET 24X140G VAN ZON;40341;Gehaktbal #141 Agora Culinair 24x140g;
;Bouletten 24st;655;BOELET 24X140G VAN ZON;40341;Gehaktbal #141 Agora Culinair 24x140g;
;Braadworst OVI;919;BRAADWORST WIT 24X150G VR;;;
;Braadworsten Van Reusel;919;BRAADWORST WIT 24X150G VR;40820;Braadworst wit blauw Vanreusel 24x150g;
;Brioche Broodje;60909;PAST. 2684 PREM. HAMBURGERBROODJE BRIOCHE 30;24622;Hamburger bun brioche pre-sliced T&S 2104377;
;Broodjes Lang;74892;PAST. 223871 HOTDOG PICCOLO BROODJE 60X72G;24921;Hotdog broodje classic wit T&S 223871 Pastri;
;Brusselse Wafel;39375;BRUSSELSE WAFELS 24X80G DELIGOUT;23250;Brusselse wafel rood diepvries 4x6 vakjes De;
;Calippo Orange;;;;;
;Callippo Cola;;;;;
;Cervela Vers;915;CERVELA ROOD 5X6X140G VR;;;
;Cervela's Van Reusel;915;CERVELA ROOD 5X6X140G VR;40758;Cervela rood #132 Agora Culinair 30x140g;
;Chicken Burger;;;40217;Kipburger krokant Vanreusel 24x85g;
;Chicken Strips;78694;KIPFILET GEBAKKEN STRIPS 12MM 2,5KG EUR.CUIS;84049;Kippendijvlees gebakken halal 0,7cm Europa C;
;Chocomouse;;;;;
;Churros;43486;CHURROS 1KG DV AVIKO;40078;Churros loop Aviko 1kg;
;Cornetto;;;;;
;Crocacoq(kipcorn) Van Reusel;1744;CROCACOQ 24X80G VR;40620;Crocacoq Vanreusel 24x80g;
;Croque Monsieur;;;;;
;Curryworst Halal;;;40258;Frikandel ProHalal Vanreusel 40x85g;
;Curryworst OVI;629;FRIKANDEL MEGA-FRIK 40X100G VAN ZON;40319;Frikandel #102 Agora Culinair 40x100g;
;Curryworst Rood;629;FRIKANDEL MEGA-FRIK 40X100G VAN ZON;40415;Frikandel excellent #101 Agora Culinair 40x100g;
;Curryworst Van Reusel;629;FRIKANDEL MEGA-FRIK 40X100G VAN ZON;40319;Frikandel #102 Agora Culinair 40x100g;
;Curryworst ZERO;66041;FRIKANDEL VEGGIE 20X85G VR;40887;Frikandel veggie Vanreusel 20x85g;
;Curryworstenbrood;82900;DIVERSI 6551 WORSTENBROODJE KIP HALAL 40X165G;;;
;De Perlut;;;;;
;Donuts;;;;;
;Flatbread ( Voor Kebab);81816;DIVERSI 3024 FLATBREAD GRILL ROND 65X120G;25971;Flatbread grill rond 3024 Ã14cm Diversi 65x1;
;Frisko;;;;;
;Fusili;;;;;
;Gerookte Zalm;;;203675;Zalmfilet Noors gerookt zonder vel diepvries;
;Gerookte Zalm  ( Stuk );;;203675;Zalmfilet Noors gerookt zonder vel diepvries;
;Gesneden Ajuin Diepvries;;;;;
;Glutenvrije Kaaskroket BONI;13704;KAASKROKET 24X80G PB;61563;;
;Goudstaaf (viandel);904;VIANDEL 27X100G MORA;;artnr invullen bij AC-VH;ja
;Goulashkroket De Jong;;;;;
;Goulashkroket PB Snacks;;;;;
;Groenten Mix Ardo;22600;WOKMIX THAI 2,5KG DV OERLEMANS;;;
;Haggis;;;;;
;Hamburger OVI;803;HAMBURGER 30X100G VAN ZON;;;
;Hamburgers 30 St Van Reusel;803;HAMBURGER 30X100G VAN ZON;40348;Hamburger excellent #121 Agora Culinair 30x1;
;Hot En Spicy Chicken Strips;78694;KIPFILET GEBAKKEN STRIPS 12MM 2,5KG EUR.CUIS;;;
;Hotwings;77887;CRISPY CHICKEN WINGS KENTUCKY STYLE 2,5KG DV;;;
;Ijsblokjes;64852;IJSBLOKJES 2KG PREMIUM 528;23625;IJsblokjes Ice Factory 6x2kg;
;Kaasballetjes;;;;;
;Kaaskroket  OVI;13704;KAASKROKET 24X80G PB;;;
;Kaaskroket ( De Jong ) 28st;13704;KAASKROKET 24X80G PB;61563;;
;Kaaskroket PB;13704;KAASKROKET 24X80G PB;;;
;Kaassoufle;;;;;
;Kebab Broden;;;25535;Turks kebabbrood Agora Culinair 4x2st;
;Kebabvlees;;;41149;Kebabvlees kip authentic Pittaman 10kg;
;Kibbeling;;;;;
;Kipcorn 36 St;62187;KIPCROKSTICK 24X80G DV VAN ZON;40969;Kipcroq Agora Culinair 36x80g;
;Kipnuggets;31295;NUGGIZZ (NUGGETS) 90X22G VR;45920;Kipnuggets Nuggizz + pockets Vanreusel 90x22;
;Kippenblokjes;;;;;
;Kipsate;;;;;
;Klein Mix Hapjes Van Reusel;;;;;
;Kroketten;12703;VLEESKROKET 10% 24X100G PB;;;
;Loempia Met Kip Vr;77998;VIETNAMESE LOEMPIA KIP 20X70G VR;41355;Loempia Vietnamees kip Vanreusel 20x70g;
;Loempia Veggi Vr;66041;FRIKANDEL VEGGIE 20X85G VR;41356;Loempia Vietnamees veggie Vanreusel 20x70g;
;Luikse Wafel;14090;LOTUS SUZY LUIKSE WAFEL 24X90G;;artnr invullen bij AC-VH;ja
;Magnum Almond;;;;;
;Magnum Bruin;;;;;
;Magnum Wit;;;;;
;MAXIBOL PASTRIDOR;;;21114;Bol maxi VGB 265 Ã13cm Pastridor 44x100g;
;Mexicano Halal;55029;MEXICANO CHICKEN HALAL 15X135G DE VRIES;;;
;Mini Loempia Veggi;;;41356;Loempia Vietnamees veggie Vanreusel 20x70g;
;Mini Loempia Veggi Van Reusel;;;41356;Loempia Vietnamees veggie Vanreusel 20x70g;
;Mini Megamix Buitenhuis;55011;MINI SNACKS XL 8X8ST ELITE;40443;Snacks mini XL Elite 64x30g;
;Mini Mexicano;73953;MINI MEXICANO 50X30G DE VRIES;;;
;Mini Sandwich;;;;;
;Pannenkoek;82762;PANNENKOEK 100X18CM DV IJSBOERKE;22376;Pannenkoek boter Missault 32x80g;
;Party Mix Elite;55011;MINI SNACKS XL 8X8ST ELITE;40443;Snacks mini XL Elite 64x30g;
;Pasta Glutenvrij;;;;;
;Penne ARDO ( Dz );48864;PENNE PASTACONCEPT 3X4KG DV SMILING COOK;27301;Penne diepvries Ardo 4x2kg;
;Pitta Brood;80317;PITABROODJE 14CM 12X6X80G BULK NINA BAKERY;;artnr invullen bij AC-VH;ja
;Pittavlees;;;41149;Kebabvlees kip authentic Pittaman 10kg;
;Pizza 4 Kazen ( Veggi );;;24304;Pizza Perfettissima quattro formaggi Ã29cm D;
;Pizza BBQ;;;24992;Pizza Perfettissima BBQ pollo Ã29cm Dr Oetke;
;Pizza Margaritha;;;24303;Pizza Perfettissima margherita Ã29cm Dr Oetk;
;Pizza Plaat Margaritha;81675;PLAAT PIZZA MARGHERITA VGS 6 PUNTEN 1,05KG D;25920;Pizza plaat margherita voorgesneden 6 punt 2;
;Pizza Plaat Salami;81677;PLAAT PIZZA SALAMI VGS 6 PUNTEN 1,145KG DV;25921;Pizza plaat salami voorgesneden 6 punt 28x48;
;Pizza Plaat Verduna Veggi;81679;PLAAT PIZZA VERDURA VGS 6 PUNTEN 1,32KG DV;25922;Pizza plaat verdura broccoli-rode voorgesned;
;Pizza Proscuitto;69981;PIZZA PROSCIUTTO PERFETTISSIMA 6X410G DV DR;24486;Pizza Perfettissima prosciutto Ã29cm Dr Oetk;
;Pizza Spinazi;;;;;
;Pizza Spinazie Vegan;;;;;
;Poke Bowl Falafel;;;;;
;Poke Bowl Kip;;;;;
;Poke Bowl Zalm;;;;;
;Pulled Chicken;;;;;
;Pulled Porc (vlees);;;;;
;Raket;;;;;
;REUZE BRAADWORST Witte Dozen OVI;919;BRAADWORST WIT 24X150G VR;;;
;Rijst Met Groenten;;;;;
;Rijst Met Groenten Ardo ( Dz);;;;;
;Ronde Broodje Crystal Rustic;76167;PANESCO CRYSTAL ROLL RUSTIEK PRE-SLICED 60X7;24950;Crystal roll rustic pre-sliced FB 5002075 Ã1;
;Ronde Broodjes Hamb Pastridor;35387;PAST. 2076 HAMBURGERBROODJE GESNEDEN 3X20X62;25082;Hamburger bun classic pre-sliced T&S 2076 Ã1;
;Ronde Broodjes Maxi Bol Pastridor;;;21114;Bol maxi VGB 265 Ã13cm Pastridor 44x100g;
;Ronde Broodjes Pastridor Pistolet Gesneden;35387;PAST. 2076 HAMBURGERBROODJE GESNEDEN 3X20X62;25082;Hamburger bun classic pre-sliced T&S 2076 Ã1;
;Samosa Dz;;;45642;Samosa cocktail Orien Bites 67x15g;
;Sate Horeca Grote Snit;951;SATE GS ROSE 25X130G VR;40343;SatÃ© grote snit #151 Agora Culinair 25x130g;
;SatÃ© Van Hout;951;SATE GS ROSE 25X130G VR;40343;SatÃ© grote snit #151 Agora Culinair 25x130g;
;Sitostick;79997;SITO GOLD (21+3)X125G MORA;;artnr invullen bij AC-VH;ja
;Sitostick Mora;79997;SITO GOLD (21+3)X125G MORA;;artnr invullen bij AC-VH;ja
;Sunbrero ( Mexicano ) Halal;81907;SUNBRERO 15X140G VAN ZON;41297;Â¡Caramba! 14+1 gratis #143 Agora Culinair 15;
;Tiramisu;;;;;
;Vanille Schepijs;;;;;
;Veggi Bitterballen;60761;DE JONG GROENTE BITTERBAL 65X30G DV;;;
;Veggi Burgers Chickless;73567;BICKY CHICKLESS BURGER 24X80G;41208;Bicky burger chickless veggie 24x80g;
;Veggi Mini Belet;;;;;
;Vleeskroket De Jong;12703;VLEESKROKET 10% 24X100G PB;60768;;
;Vleeskroket PB Snacks;12703;VLEESKROKET 10% 24X100G PB;;;
;Wedges;;;;;
;Wok Met Kip Kant En Klaar;;;;;
;Ajuin Gesneden;;;;;
;Appelsienen;;;;;
;Bierbakken 0.0%;;;;;
;Boter;;;;;
;Cava;;;;;
;Chester Cheese;;;;;
;Chili Con Carne;;;;;
;Chocomelk;;;;;
;Coca Cola Flessen;;;;;
;Coca Cola Pet;;;;;
;Coca Zero Pet;;;;;
;Cola Flessen;;;;;
;Cola Zero Flessen 1/1;;;;;
;Eieren Gekookt Gepeld;;;;;
;Fanta Glazen Flesjes;;;;;
;Fanta Pet;;;;;
;Frieten 10 Kg Lutosa;;;;;
;Geraspte Kaas ( Zak );;;;;
;Gerookte Zalm Vers;;;203675;Zalmfilet Noors gerookt zonder vel diepvries;
;Gesneden Ajuin Per Kg;;;;;
;Gesneden Ham;;;;;
;Gesneden Wortelen;;;;;
;Kaas 5/15 Gesneden;;;;;
;Kaasblokjes;;;;;
;Kip Curry;;;;;
;Kool Mix;;;;;
;Koolsla (1.5kg);;;;;
;Kruidenkaas Helleman;;;;;
;Leffe Donker;;;;;
;Limonade Flessen 1/1;;;;;
;Mocktail  Spritz;;;;;
;Mocktail Mojito;;;;;
;Rode Ajuin;;;;;
;Rode Wijn;;;;;
;Salami Blokjes;;;;;
;Sla;;;;;
;Slagroom;;;;;
;Snipper Ajuin Zak;;;;;
;Snipper Ui;;;;;
;Spek Dun Gesneden Beef Burger;49618;BLACK ANGUS BEEF BURGER 40X100G VR;40125;Hamburger black Angus beef Vanreusel 40x100g;
;Stoofvlees Ovi;;;;;
;Tomaten;;;51258;Tomatenketchup Pauwels 10l;
;Tomato Relisch;;;;;
;Tonijnsalade;;;;;
;Vaten Bier;;;;;
;Vers Stoofvlees 1kg Bartis;;;;;
;Verse Frieten 10 Kg;;;;;
;Verse Sate;;;;;
;Videe Ovi;;;;;
;Vleessalade;;;;;
;Water Bruis Flessen 1/1;;;;;
;Water Plat Flessen 1/1;;;;;
;Witte Wijn;;;;;
;Ajuin Zak 25kg;;;;;
;Augurken Pot;;;;;
;Bakplaat Electr;;;;;
;Bakplaat Gas;;;;;
;Bicky Uitjes Zak 500g;;;;;
;Bloemsuiker;1920;BLOEMSUIKER 2KG S0 TIENEN;;artnr invullen bij AC-VH;ja
;Bologniase Van De Chef Manna ( Dz );;;;;
;Boulet Bakje Bruin A7;74871;A7 BAKJE KARTON BRUIN 9X6X3CM 250ST;153458;Frietbakje futuro karton bruin A7 10x7xH3cm;
;Boulet Schaal Wit;74649;A16L BAKJE KARTON BRUIN 21X4X3,5CM 250ST;;;
;Brood Gesneden;;;;;
;Bruine suiker;;;194815;Kandijsuiker cassonade bruin Candico 1kg;
;Bruine Suiker ( Candij );;;194815;Kandijsuiker cassonade bruin Candico 1kg;
;Cabonara Saus D Lis;27006;CARBONARA SAUS 1KG SMILING COOK;59706;Carbonarasaus H8 Smiling Cook 6x1kg;
;Carbonara Saus Smiling Cook ( Dz );27006;CARBONARA SAUS 1KG SMILING COOK;59706;Carbonarasaus H8 Smiling Cook 6x1kg;
;Cecemel Bekers;;;;;
;Chili Sin Carne;;;;;
;Chips Paprika;;;;;
;Chips Zout;;;;;
;Curry Saus Groenten Mars;;;;;
;Currysaus Uncle Bens;;;;;
;Curryworst Schaal Bruin A16L;74649;A16L BAKJE KARTON BRUIN 21X4X3,5CM 250ST;151579;Bakje futuro karton bruin A16L 22x5xH3,5cm 250st;
;Curryworst Schaal Wit;74649;A16L BAKJE KARTON BRUIN (wit equivalent);151579;Bakje futuro karton bruin A16L â witte variant zie VZ;
;Emmers;;;;;
;Flatbread Kebab;;;25535;Turks kebabbrood Agora Culinair 4x2st;
;Frietbak Bruin Vip 75;74871;A7 BAKJE KARTON BRUIN 9X6X3CM 250ST;153458;Frietbakje futuro karton bruin A7 10x7xH3cm;
;Frietbakje 80;74871;A7 BAKJE KARTON BRUIN 9X6X3CM 250ST;153458;Frietbakje futuro karton bruin A7 10x7xH3cm;
;Frietbakje 85;;;151771;Frietbakje bio karton bruin nr 85 250st;
;Frietbakje Bruin 85;;;151771;Frietbakje bio karton bruin nr 85 250st;
;Frietbakje Stoofvlees;74649;A16L BAKJE KARTON BRUIN 21X4X3,5CM 250ST;151579;Bakje futuro rechthoekig karton bruin A16L 2;
;Frietvorkjes Hout Klein;72687;FRIETVORKJES HOUT 8,5CM 1000ST;153743;Vork friet hout 8,5cm 1.000st;
;Frituurolie 15L;40876;FRITUUROLIE FRIBEL CULINAIR 15L;130230;Frituurolie fribel chef Pauwels 15l;
;Gedroogde Appelsien;;;;;
;Gedroogde Limoen;;;;;
;Ginger Lemon Saus;;;;;
;Groentensaus Manna ( Pot );64794;GROENTENSAUS 2L MANNA;52033;Groentesaus Manna 2l;
;Grote Vorken;;;153740;Vork hout 16cm 100st;
;Hamburger Zakjes;78242;HAMBURGER ZAKJES PAPIER NEWS PAPER 13X14CM 1;151966;Hamburgerzakjes groot erzatz 16x17,5cm 1.000;
;Herbruikbaar Frietbakje;;;;;
;Herbruikbaar Frietbakje Stoofvlees;74649;A16L BAKJE KARTON BRUIN 21X4X3,5CM 250ST;151579;Bakje futuro rechthoekig karton bruin A16L 2;
;Herbruikbaar Pasta Bajke;;;;;
;Herbruikbare Bierbeker;;;;;
;Herbruikbare Koffie Beker;;;;;
;Hoorntjes Voor Ijs;;;;;
;HOT DOG WORSTEN;5498;HOTDOG 10X50G OVI;;artnr invullen bij AC-VH;ja
;Houten Tandenstokers;;;;;
;Karton Bord 18 Cm Bruin;76068;KARTON BORD WIT 18CM 50ST;153513;Bord karton bruin Ã18cm 50st;
;Karton Bord 23 Cm Bruin;78413;KARTON BORD WIT 23CM 50ST;153505;Bord karton bruin P24 Ã23cm 50st;
;Karton Saus Potje 50cc;;;153196;Potje saus karton bruin 60ml 50st;
;Karton Schaal Nr 0 Wit;;;;;
;Kartonnen Draagplateau;;;;;
;Kartonnen Drank Bekers;;;;;
;Kartonnen Houder Luikse Wafel;14090;LOTUS SUZY LUIKSE WAFEL 24X90G;;artnr invullen bij AC-VH;ja
;Kartonnen Pizza Schaaltjes;;;;;
;Kippekruiden;;;;;
;Koffie Bonen;;;95012;Koffie gemalen perco Casaleli 1kg;
;Koffie Gemalen;;;95012;Koffie gemalen perco Casaleli 1kg;
;Leffe Licht;;;;;
;Lepeltjes  Voor Ijs;;;;;
;Lichte Bruine Suiker;;;194815;Kandijsuiker cassonade bruin Candico 1kg;
;Melk Porties;;;93396;Melkcups 10% vetgehalte witte kleur Eurocrea;
;Messen Hout;;;;;
;Nootjes;;;;;
;Nutella Pomp;49612;CHOCOPASTA NUTELLA 3KG;120021;Chocoladepasta Nutella 2x3kg;
;Nutella Pot;49612;CHOCOPASTA NUTELLA 3KG;120021;Chocoladepasta Nutella 2x3kg;
;Olie;40876;FRITUUROLIE FRIBEL CULINAIR 15L;130230;Frituurolie fribel chef Pauwels 15l;
;Pansavers 1/2;;;;;
;Pansavers 1/3;;;;;
;Paty Spray;;;;;
;Patyspray;;;;;
;Plastiek Schaal;;;;;
;Potjes Voor Ijs;;;;;
;Red Bull Tray;1277;RED BULL 24X25CL BLIK;;;
;Rijst;;;130212;Rijstolie Daily 500ml;
;Rijstolie;;;130212;Rijstolie Daily 500ml;
;Roerstaafjes Hout;;;;;
;Rose Wijn;;;;;
;Salade  Bowl;80744;BRUIN KRAFT BOWL 500ML 50ST;151878;Bowl karton bruin 500ml 50st;
;Salade Bowl 500 Ml;80744;BRUIN KRAFT BOWL 500ML 50ST;151878;Bowl karton bruin 500ml 50st;
;SatÃ©kruiden;63706;SATEKRUIDEN BUDGET 1KG PURE VERSTEGEN;100567;SatÃ©kruiden met zout pure budget Verstegen 1;
;Servietten ( 500st );65325;SERVET 1-LAAGS WIT 33X33CM 500ST;157533;Servet snack 1 laag wit 33x33cm Tork 500st;
;Servietten ( 500st )  Tork;65325;SERVET 1-LAAGS WIT 33X33CM 500ST;157533;Servet snack 1 laag wit 33x33cm Tork 500st;
;Servietten Houder;;;;;
;Sierprikker;;;156660;Prikker knoop bamboe 10cm Sier 250st;
;Siroop;;;;;
;SNOEPZAK;81795;SNOEPZAK SWEET 250G CANDYVILLE;;artnr invullen bij AC-VH;ja
;Soja Saus;;;;;
;Soja Scheuten;;;;;
;Speuloos Verpakt ( Voor Bij Koffie );;;;;
;Steekkar;;;;;
;Stoofvlees;74649;A16L BAKJE KARTON BRUIN 21X4X3,5CM 250ST;151579;Bakje futuro rechthoekig karton bruin A16L 2;
;Stoofvleessaus;;;;;
;Suiker Klontjes Verpakt;1927;SUIKERKLONTJES VERPAKT 1000X5G VAN ZON;190047;Suikerklontjes Agora Culinair 1.000x4,5g;
;Suikerwafel Individueel Verpakt;;;;;
;Sweet Chili Met Groenten Saus Mars;;;;;
;Tabasco;40800;TABASCO RODE PEPERSAUS 150ML MC ILHENNY;57601;Tabasco groot 350ml;
;Thee Zakjes;;;98009;Thee yellow label Lipton 100st;
;Tipzak Karton Nr 2;3315;TIP 1 FRIETZAKJES KARTON 1000ST;;;
;Torkrol;143;POETSROL MAXITORK 1L 6X350M (22CM) VAN ZON (;156142;Poetsrol groot 1-laags 20cm 300m Agora Culin;
;Vet 10 kg;80454;VET RUNDS 4X2,5KG FRIBEL;133635;Frituurvet geraffineerd Fribel 4x2,5kg;
;Vet Lopend;80454;VET RUNDS 4X2,5KG FRIBEL;133635;Frituurvet geraffineerd Fribel 4x2,5kg;
;Vuilzakken;;;;;
;Vuilzakken 240 L;;;;;
;Wrap ( Tortilla Zelf );;;;;
;Wrap ( Tortilla Zelf ) Stuks;;;;;
;Zemst;;;;;
;Zonnebloemolie;40876;FRITUUROLIE FRIBEL CULINAIR 15L;130230;Frituurolie fribel chef Pauwels 15l;
;Zuurkool Blik;1702;ZUURKOOL 1L KRAMER;19975;Zuurkool natuur Kramer 1l;
;Aperol Spritsz;;;;;
;Appelsap Tray;40482;APPELSAP 6X20CL VARESA;;;
;Bier Blik Tray;3062;JUPILER COLD GRIP 24X33CL BLIK;34740;Jupiler blik 24x330ml;
;Casis Blik Tray;;;30428;Hero cassis blik 24x330ml;
;Coca Cola Flesjes Glas Klein;;;;;
;Coca Cola Zero;;;;;
;Cola Blik Tray;25848;COCA COLA 30X33CL SLEEK BLIK;;artnr invullen bij AC-VH;ja
;Cola Zero Blik Tray;47224;COCA COLA ZERO 30X33CL SLEEK BLIK;;artnr invullen bij AC-VH;ja
;Cola Zero Klein Flesjes;;;;;
;Dr Pepper Blik Tray;11725;DR PEPPER 24X33CL BLIK;32100;Dr. Pepper blik 24x330ml;
;Fanta Blik Tray;2641;FANTA 24X33CL SLEEK BLIK;30701;Fanta orange blik sleek 24x330ml;
;Fristi Tray;11609;FRISTI 12X25CL BLIK;;;
;Fruitsap;;;;;
;Gluhwijn;;;;;
;Hot Cecemel;;;;;
;Ice Tea Blik Tray;2648;ICE TEA LIPTON REGULAR 24X33CL BLIK;34100;Lipton Ice Tea regular blik 24x330ml;
;Ice Tea Green Blik Tray;13693;ICE TEA GREEN LIPTON 24X33CL BLIK NIET BRUIS;30103;Lipton Ice Tea green niet-bruisend Fat blik;
;Ice Tea Klein Flesjes;;;;;
;Jenever;;;;;
;Klein Flesjes Plat Water;;;;;
;Melk;;;93396;Melkcups 10% vetgehalte witte kleur Eurocrea;
;Mojito;;;;;
;Plat Water Pet Tray;16689;CHAUDFONTAINE 24X50CL PET;37600;Chaudfontaine plat 24x500ml;
;Sprite Blik Tray;2678;SPRITE 24X33CL SLEEK BLIK;;artnr invullen bij AC-VH;ja
;Tongerlo Blond;;;;;
;Tongerlo Donder;;;;;
;Water Bruis Klein Flesjes;;;;;
;Water Bruis Pet Tray;16697;CHAUDFONTAINE BRUIS 24X50CL PET;;;`;

  function fix(s) {
    if (!s) return '';
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  var lines = CSV.split(/\r?\n/);
  var out = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
    if (!line || !line.trim()) continue;
    var f = line.split(';');
    var naam = fix((f[1] || '').trim());
    if (!naam) continue;
    // Sla de legenda-/voettekstrij over.
    if (/VAN ZON artnr|AC-VAN HOUT|artnr nog invullen|Andere leverancier/i.test(naam)) continue;
    out.push({
      id: 'p' + i,
      naam: naam,
      artVZ: (f[2] || '').trim(),
      omsVZ: fix((f[3] || '').trim()),
      artAC: (f[4] || '').trim(),
      omsAC: fix((f[5] || '').trim()),
    });
  }
  // ── Curatie: sunbrero is de standaard voor mexicano ──────────────────
  // De sunbrero wordt voortaan getoond als "mexicano/sunbrero/belcanto".
  // De overige mexicano-/belcanto-varianten blijven in de data staan zodat
  // ze niet uit een lopende bestelling verdwijnen, maar worden verborgen uit
  // de zoek-/keuzelijst (hidden:true → niet zichtbaar tenzij al besteld).
  var STANDAARD_MEXICANO = 'belcanto/sunbrero';
  var VERBERG_NAMEN = {
    'Amigo ( Mexicano ) OVI': 1,
    'Belcanto': 1,
    'Mexicano Halal': 1,
    'Sunbrero ( Mexicano ) Halal': 1
  };
  out.forEach(function (p) {
    if (p.naam === STANDAARD_MEXICANO) { p.naam = 'mexicano/sunbrero/belcanto'; }
    else if (VERBERG_NAMEN[p.naam]) { p.hidden = true; }
  });

  window.PRODUCT_CATALOGUS = out;
})();
