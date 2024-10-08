const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const matter = require('gray-matter');

require('dotenv').config();

// Database connection setup
const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DATABASE_PASSWORD}@127.0.0.1:5432/postgres`,
});

// Directory where markdown files are stored
const articlesDir = path.join(__dirname, './writings');

// Function to read markdown files and save to the database
async function updateArticles() {
  await client.connect();
  console.log('Connection set up');

  const files = fs.readdirSync(articlesDir);

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContent);

    // Use filename (without extension) as slug
    const slug = path.basename(file, path.extname(file));

    console.log(`File ${slug} is processing`);

    const article = {
      slug: slug,
      title: data.title,
      date: data.date,
      description: data.description,
      readtime: data.readtime,
      content: content,
    };

    let typeId;
    // Insert or update stages and associate with the article
    if (data.type) {
      let typeRes = await client.query('SELECT id FROM "Expectation" WHERE type = $1', [data.type]);
      if (typeRes.rows.length === 0) {
        console.log(`New type was found and being inserted in DB`);
      } else {
        // Get existing topic ID
        typeId = typeRes.rows[0].id;
      }
    }

    // Check if the article exists
    let res = await client.query('SELECT id FROM "Article" WHERE slug = $1', [slug]);
    let articleId;
    if (res.rows.length > 0) {
      console.log('Update it in DB');
      // Update existing article
      articleId = res.rows[0].id;
      await client.query(
        'UPDATE "Article" SET title = $1, date = $2, description = $3, readtime = $4, content = $5, "expectationId" = $7 WHERE slug = $6',
        [article.title, article.date, article.description, article.readtime, article.content, article.slug, typeId]
      );
    } else {
      console.log('Insert it in DB');
      // Insert new article
      res = await client.query(
        'INSERT INTO "Article" (slug, title, date, description, readtime, content, "expectationId") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [article.slug, article.title, article.date, article.description, article.readtime, article.content, typeId]
      );
      articleId = res.rows[0].id;
    }
    console.log('File is up-to-date now');

    // Process topics
    const topics = data.topics.split(';').map((topic) => topic.trim());

    // Insert or update topics and associate with the article
    for (const topicName of topics) {
      let topicRes = await client.query('SELECT id FROM "Topic" WHERE name = $1', [topicName]);
      let topicId;
      if (topicRes.rows.length === 0) {
        console.log(`New topic ${topicName} was found and being inserted in DB`);
        // Insert new topic
        topicRes = await client.query('INSERT INTO "Topic" (name) VALUES ($1) RETURNING id', [topicName]);
        topicId = topicRes.rows[0].id;
      } else {
        // Get existing topic ID
        topicId = topicRes.rows[0].id;
      }

      // Associate topic with article
      await client.query(
        'INSERT INTO "_ArticleTopics" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [articleId, topicId]
      );
      console.log(`File is now associated with topic ${topicName}`);
    }

    // Process stages
    const stages = data.stages.split(';').map((stages) => stages.trim());

    // Insert or update stages and associate with the article
    for (const stageName of stages) {
      let stageRes = await client.query('SELECT id FROM "Stage" WHERE name = $1', [stageName]);
      let stageId;
      if (stageRes.rows.length === 0) {
        console.log(`New stage ${stageName} was found`);
      } else {
        // Get existing topic ID
        stageId = stageRes.rows[0].id;
      }

      // Associate topic with article
      await client.query(
        'INSERT INTO "_ArticleStages" ("A", "B") VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [articleId, stageId]
      );
      console.log(`File is now associated with stage ${stageName}`);
    }
  }

  await client.end();
}

updateArticles().catch((err) => {
  console.error('Error updating articles:', err);
  process.exit(1);
});
