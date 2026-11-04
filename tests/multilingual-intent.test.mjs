import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest } from '../src/lib/request-intent.js';
import { INTENT_LEXICON, OUTPUT_FORMATS } from '../src/lib/intent-lexicon.js';

const samples = {
 en:['Generate an image of a cat','Create a video of a beach','Make a logo for my shop','Draw a portrait of my dog','Generate a poster for an event','Create an animation of a bird','Please design an image of a house','Make a clip showing ocean waves'],
 es:['Genera una imagen de un gato','Crea un video de una playa','Haz un logo para mi tienda','Dibuja un retrato de mi perro','Genera un cartel para un evento','Crea una animación de un pájaro','Por favor crea una imagen de una casa','Haz un clip de las olas'],
 fr:['Génère une image de chat','Crée une vidéo de plage','Crée un logo pour ma boutique','Dessine un portrait de chien','Génère une affiche pour événement','Crée une animation de oiseau','Veuillez créer une image de maison','Fais un clip des vagues'],
 pt:['Gere uma imagem de gato','Crie um vídeo de praia','Faça um logo para minha loja','Desenhe um retrato de cachorro','Gere um cartaz para evento','Crie uma animação de pássaro','Por favor crie uma imagem de casa','Faça um clipe das ondas'],
 de:['Generiere ein Bild von einer Katze','Erstelle ein Video vom Strand','Erstelle ein Logo für meinen Laden','Zeichne ein Porträt eines Hundes','Generiere ein Plakat für ein Ereignis','Erstelle eine Animation eines Vogels','Bitte erstelle ein Bild von einem Haus','Mach einen Clip von Wellen'],
 ar:['أنشئ صورة لقطة','أنشئ فيديو للشاطئ','صمم شعارًا لمتجري','ارسم صورة كلب','أنشئ ملصقًا لحدث','أنشئ رسوم متحركة لطائر','من فضلك أنشئ صورة لمنزل','اصنع مقطعًا للأمواج'],
 hi:['एक बिल्ली की तस्वीर बनाओ','समुद्र तट का वीडियो बनाओ','मेरी दुकान का लोगो बनाओ','कुत्ते का चित्र बनाओ','कार्यक्रम का पोस्टर बनाओ','पक्षी का एनीमेशन बनाओ','कृपया घर की तस्वीर बनाओ','लहरों का वीडियो बनाओ'],
 sw:['Tengeneza picha ya paka','Tengeneza video ya ufuo','Buni nembo ya duka langu','Chora picha ya mbwa','Tengeneza bango la tukio','Unda uhuishaji wa ndege','Tafadhali tengeneza picha ya nyumba','Tengeneza klipu ya mawimbi'],
 yo:['Ṣẹ̀dá àwòrán ológbò','Ṣẹ̀dá fídíò etíkun','Ṣẹ̀dá àmì ọjà fún ilé ìtajà mi','Ya àwòrán ajá','Ṣẹ̀dá àwòrán ìpolówó fún ayẹyẹ','Ṣẹ̀dá fídíò ìṣípò ẹyẹ','Jọ̀wọ́ ṣẹ̀dá àwòrán ilé','Ṣẹ̀dá fídíò omi'],
 ig:['Mepụta onyonyo nwamba','Mepụta vidio osimiri','Mepụta akara ngosi ụlọ ahịa m','See eserese nkịta','Mepụta akwụkwọ mgbasa maka mmemme','Mepụta animation nnụnụ','Biko mepụta onyonyo ụlọ','Mepụta vidio ebili mmiri'],
 ha:['Ƙirƙiri hoto na cat','Ƙirƙiri bidiyo na bakin teku','Ƙirƙiri tambari na shagona','Zana hoton kare','Ƙirƙiri zane na taro','Ƙirƙiri animation na tsuntsu','Don Allah ƙirƙiri hoto na gida','Yi bidiyo na raƙuman ruwa'],
 pcm:['Generate picture of cat abeg','Create video of beach','Make logo for my shop','Draw portrait of my dog','Generate poster for event','Create animation of bird','Abeg make picture of house','Make video of ocean waves'],
 id:['Buat gambar kucing','Buat video pantai','Buat logo untuk toko saya','Gambar potret anjing','Buat poster acara','Buat animasi burung','Tolong buat gambar rumah','Buat klip ombak'],
 zh:['生成一张猫的图片','创建海滩视频','制作我的商店标志','画一张狗的肖像','生成活动海报','创建鸟的动画','请生成房子的图片','制作海浪短片'],
 ja:['猫の画像を生成して','海辺の動画を作って','店のロゴを作成して','犬の肖像を描いて','イベントのポスターを作って','鳥のアニメーションを作って','家の画像を作ってください','波の動画を作って'],
 ko:['고양이 이미지를 생성해','해변 동영상을 만들어','내 가게 로고를 만들어','강아지 초상화를 그려','행사 포스터를 만들어','새 애니메이션을 만들어','집 이미지를 만들어 주세요','파도 영상을 만들어'],
 ru:['Создай изображение кота','Создай видео пляжа','Создай логотип моего магазина','Нарисуй портрет собаки','Создай плакат для события','Создай анимацию птицы','Пожалуйста создай изображение дома','Сделай ролик волн'],
 tr:['Bir kedi görseli oluştur','Sahil videosu oluştur','Mağazam için logo oluştur','Bir köpek portresi çiz','Etkinlik afişi oluştur','Kuş animasyonu oluştur','Lütfen ev görseli oluştur','Dalgaların videosunu oluştur']
};
const negatives = {
 en:['How do I generate an image in Python?','Explain video encoding','Write code to resize an image','Review this image prompt','What is a video codec?','Analyze this photo','Give me a prompt for a logo','Compare image formats'],
 es:['Cómo generar una imagen en Python','Explica la codificación de video','Escribe código para redimensionar imagen','Revisa este prompt de imagen','Qué es un códec de video','Analiza esta foto','Dame un prompt para un logo','Compara formatos de imagen'],
 fr:['Comment générer une image en Python','Explique le codage vidéo','Écris du code pour redimensionner une image','Révise ce prompt image','Qu’est-ce qu’un codec vidéo','Analyse cette photo','Donne un prompt pour un logo','Compare les formats image'],
 pt:['Como gerar imagem em Python','Explique codificação de vídeo','Escreva código para redimensionar imagem','Revise este prompt de imagem','O que é codec de vídeo','Analise esta foto','Dê um prompt para logo','Compare formatos de imagem'],
 de:['Wie generiere ich ein Bild in Python','Erkläre Videocodierung','Schreibe Code zum Skalieren eines Bildes','Prüfe diesen Bild-Prompt','Was ist ein Videocodec','Analysiere dieses Foto','Schreibe einen Prompt für ein Logo','Vergleiche Bildformate'],
 ar:['كيف أنشئ صورة باستخدام كود','اشرح ترميز الفيديو','اكتب كود لتغيير حجم صورة','راجع هذا الموجه للصورة','ما هو ترميز الفيديو','حلل هذه الصورة','اكتب موجهًا لشعار','قارن صيغ الصور'],
 hi:['Python में तस्वीर कैसे बनाएं','वीडियो एन्कोडिंग समझाओ','चित्र बदलने का कोड लिखो','इस इमेज प्रॉम्प्ट की समीक्षा करो','वीडियो कोडेक क्या है','इस फोटो का विश्लेषण करो','लोगो के लिए प्रॉम्प्ट लिखो','इमेज प्रारूपों की तुलना करो'],
 sw:['Jinsi ya kutengeneza picha kwa Python','Eleza usimbaji wa video','Andika msimbo wa kubadilisha ukubwa wa picha','Kagua prompt ya picha','Codec ya video ni nini','Chambua picha hii','Andika prompt ya nembo','Linganisha fomati za picha'],
 yo:['Báwo ni mo ṣe ṣẹ̀dá àwòrán ní Python','Ṣàlàyé ìṣàkọsílẹ̀ fídíò','Kọ koodu láti tún àwòrán ṣe','Ṣe àyẹ̀wò prompt àwòrán','Kí ni codec fídíò','Ṣàyẹ̀wò àwòrán yìí','Kọ prompt fún àmì ọjà','Fi irú àwòrán wé ara wọn'],
 ig:['Kedu ka m ga esi mepụta onyonyo na Python','Kọwaa video encoding','Dee koodu iji gbanwee onyonyo','Nyochaa image prompt a','Gịnị bụ video codec','Nyochaa foto a','Dee prompt maka logo','Tụnyere ụdị onyonyo'],
 ha:['Yaya ake ƙirƙirar hoto da Python','Bayyana video encoding','Rubuta code don canza girman hoto','Duba prompt na hoto','Menene video codec','Nazarta wannan hoto','Rubuta prompt na tambari','Kwatanta tsarin hoto'],
 pcm:['How I go make image with Python','Explain video encoding','Write code to resize picture','Review this image prompt','Wetin be video codec','Analyze this photo','Write prompt for logo','Compare image formats'],
 id:['Bagaimana membuat gambar dengan Python','Jelaskan encoding video','Tulis kode untuk mengubah ukuran gambar','Tinjau prompt gambar ini','Apa itu codec video','Analisis foto ini','Tulis prompt untuk logo','Bandingkan format gambar'],
 zh:['如何用代码生成图片','解释视频编码','写代码调整图片大小','分析这个图片提示词','什么是视频编解码器','分析这张照片','写一个标志提示词','比较图片格式'],
 ja:['Pythonで画像を生成する方法','動画エンコードを説明して','画像サイズ変更のコードを書いて','画像プロンプトを分析して','動画コーデックとは','この写真を分析して','ロゴのプロンプトを書いて','画像形式を比較して'],
 ko:['Python으로 이미지를 만드는 방법','비디오 인코딩을 설명해','이미지 크기 변경 코드를 작성해','이미지 프롬프트를 검토해','비디오 코덱이란','이 사진을 분석해','로고 프롬프트를 작성해','이미지 형식을 비교해'],
 ru:['Как создать изображение в Python','Объясни кодирование видео','Напиши код для изменения размера изображения','Проверь этот промпт изображения','Что такое видеокодек','Проанализируй это фото','Напиши промпт для логотипа','Сравни форматы изображений'],
 tr:['Python ile görsel nasıl oluşturulur','Video kodlamayı açıkla','Görsel boyutlandırma kodu yaz','Bu görsel istemini incele','Video codec nedir','Bu fotoğrafı analiz et','Logo için istem yaz','Görsel formatlarını karşılaştır']
};

test('every lexicon language has at least eight positive and eight negative regression cases', () => {
 assert.deepEqual(Object.keys(samples).sort(), Object.keys(INTENT_LEXICON).sort());
 for (const language of Object.keys(INTENT_LEXICON)) {
   assert.ok(samples[language]?.length >= 8 && negatives[language]?.length >= 8, `${language} needs both polarities`);
 }
});
test('multilingual clear media commands route and educational/code/prompt requests stay in Chat', () => {
 for (const [language, prompts] of Object.entries(samples)) for (const prompt of prompts) assert.ok(['image','video'].includes(classifyRequest(prompt).task), `${language} positive: ${prompt}`);
 for (const [language, prompts] of Object.entries(negatives)) for (const prompt of prompts) assert.equal(classifyRequest(prompt).task, 'chat', `${language} negative: ${prompt}`);
});
test('ambiguous English logo request remains medium confidence and mixed-language questions stay in Chat', () => {
 assert.equal(classifyRequest('I need a logo for my bakery').confidence, 'medium');
 assert.equal(classifyRequest('How do I create una imagen in Python?').task, 'chat');
 assert.equal(classifyRequest('Explain 生成图片 in code').task, 'chat');
});
test('output format list is available for schema parity checks', () => { assert.ok(OUTPUT_FORMATS.includes('xlsx') && OUTPUT_FORMATS.includes('pptx') && OUTPUT_FORMATS.includes('zip')); });

test('attached image editing is never classified as text-to-image generation', () => {
  const attached = [{ type: 'image/png', name: 'portrait.png' }];
  for (const prompt of ['Remove the background', 'Make it look like a watercolor', 'Add a hat', 'Upscale this image', 'Combine these images', '背景を削除して', '배경 제거', 'удали фон', 'Arka planı kaldır']) {
    const intent = classifyRequest(prompt, { attachments: attached });
    assert.equal(intent.task, 'image', prompt);
    assert.equal(intent.operation, 'edit', prompt);
    assert.equal(intent.editCapability, 'image-to-image', prompt);
  }
});

test('file-format requests are detected from localized create/export verbs and filenames',()=>{
  for(const [prompt,format] of [['Crea un archivo PDF','pdf'],['Crée un fichier PDF','pdf'],['Crie um arquivo PDF','pdf'],['Erstelle eine PDF Datei','pdf'],['创建一个PDF文件','pdf'],['PDFファイルを作成','pdf'],['PDF 파일을 만들어','pdf'],['Создай PDF файл','pdf'],['PDF dosyası oluştur','pdf']]) assert.equal(classifyRequest(prompt).fileFormat,format,prompt);
});
test('reply language detection prefers the dominant prompt language',()=>{
  assert.equal(classifyRequest('Resume este documento por favor').language,'es');
  assert.equal(classifyRequest('How do I create una imagen in Python?').language,'en');
});
test('an explicit requested response language overrides prompt-language detection', async()=>{
 const {requestedReplyLanguage}=await import('../src/lib/request-intent.js');
 assert.equal(requestedReplyLanguage('Explain this in Yoruba'),'yo');
 assert.equal(requestedReplyLanguage('Responde en inglés'),'en');
 assert.equal(requestedReplyLanguage('Reply in English, please'),'en');
});
