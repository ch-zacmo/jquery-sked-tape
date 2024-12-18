import gulp from 'gulp';
import cleanDest from 'gulp-clean-dest';
import gulpSass from 'gulp-sass';
import dartSass from 'sass';
import sourcemaps from 'gulp-sourcemaps';
import connect from 'gulp-connect';
import autoprefixer from 'gulp-autoprefixer';
import gulpif from 'gulp-if';
import plumber from 'gulp-plumber';
import notify from 'gulp-notify';
import open from 'gulp-open';
import wrap from 'gulp-wrap';
import headerComment from 'gulp-header-comment';
import rename from 'gulp-rename';
import terser from 'gulp-terser';
import stripCssComments from 'gulp-strip-css-comments';

const sass = gulpSass(dartSass);

let TASK_NOTIFICATION = false,
	LIVE_RELOAD = false

const plumberErrorHandler = {
	errorHandler: notify.onError({
		title: 'Gulp',
		message: 'Error: <%= error.message %>'
	})
}

const buildSass = (minify) => () => {
	return gulp.src('src/jquery.skedTape.sass')
		.pipe(plumber(plumberErrorHandler))
		.pipe(gulpif(minify, sourcemaps.init()))
		.pipe(sass({
			outputStyle: minify ? 'compressed' : 'expanded',
			sourcemap: true,
			includePaths: [
				//__dirname + '/node_modules/foundation-sites/scss'
			],
			errLogToConsole: true
		}))
		.pipe(autoprefixer())
		.pipe(stripCssComments())
		.pipe(headerComment(`
			jQuery.skedTape v<%= pkg.version %>
			License: <%= pkg.license %>
			Author: <%= pkg.author %>
		`))
		.pipe(gulpif(minify, rename({
			suffix: '.min'
		})))
		.pipe(gulpif(minify, sourcemaps.write('.')))
		// Remove piped files so that in case of an error their old versions don't exist.
		.pipe(cleanDest('dist'))
		.pipe(gulp.dest('dist'))
		.pipe(gulpif(TASK_NOTIFICATION, notify({
			message: 'SASS built'
		})))
}

gulp.task('sass', buildSass(false))
gulp.task('sass:min', buildSass(true))

const copyJs = (minify) => () => {
	return gulp.src(`src/*.js`)
		.pipe(plumber(plumberErrorHandler))
		.pipe(cleanDest('dist'))
		.pipe(gulpif(minify, sourcemaps.init()))
		.pipe(wrap({
			src: './umd.template.txt'
		}))
		.pipe(gulpif(minify, terser()))
		.pipe(headerComment(`
			jQuery.skedTape v<%= pkg.version %>
			License: <%= pkg.license %>
			Author: <%= pkg.author %>
		`))
		.pipe(gulpif(minify, rename({
			suffix: '.min'
		})))
		.pipe(gulpif(minify, sourcemaps.write('.')))
		.pipe(gulp.dest('dist'))
		.pipe(gulpif(TASK_NOTIFICATION, notify({
			message: 'JS copied'
		})))
}

gulp.task('copy-js', copyJs(false))
gulp.task('copy-js:min', copyJs(true))

gulp.task('dist-to-docs', () =>
	gulp.src(`dist/*`)
	.pipe(plumber(plumberErrorHandler))
	.pipe(cleanDest('docs'))
	.pipe(gulp.dest('docs'))
	.pipe(gulpif(LIVE_RELOAD, connect.reload()))
)

gulp.task('watch', () => {
	LIVE_RELOAD = true
	TASK_NOTIFICATION = true
	connect.server({
		name: 'Dist App',
		root: 'docs',
		host: '0.0.0.0',
		port: 8080,
		livereload: true
	});
	gulp.watch('src/*.sass', gulp.parallel('sass', 'sass:min'))
	gulp.watch('src/*.js', gulp.parallel('copy-js', 'copy-js:min'))
	gulp.watch('dist/*', gulp.parallel('dist-to-docs'))
	// Open browser
	gulp.src(__filename).pipe(open({
		uri: 'http://localhost:8080'
	}))
})

gulp.task('build', gulp.series(
	gulp.parallel('sass', 'sass:min', 'copy-js', 'copy-js:min'),
	'dist-to-docs'
))

gulp.task('default', gulp.series('build', 'watch'))